import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { Type } from '@sinclair/typebox';
import Stripe from 'stripe';
import { users, tokenLedger } from '../../db/schema.js';
import { config } from '../../config.js';

const TOKEN_PACKS = [
  { id: 'pack_100', tokens: 100, price: 200, label: '100 Tokens — $2' },
  { id: 'pack_500', tokens: 500, price: 800, label: '500 Tokens — $8' },
  { id: 'pack_1000', tokens: 1000, price: 1500, label: '1000 Tokens — $15' },
];

function getStripe(): Stripe | null {
  if (!config.STRIPE_SECRET_KEY) return null;
  return new Stripe(config.STRIPE_SECRET_KEY);
}

const CreateCheckoutBody = Type.Object({
  pack_id: Type.String(),
});

export default fp(async (app: FastifyInstance) => {
  // ─── List available packs ───
  app.get(
    '/api/billing/packs',
    { schema: { tags: ['billing'] } },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ packs: TOKEN_PACKS });
    },
  );

  // ─── Create Stripe checkout (or BIBD Pay order for manual flow) ───
  app.post(
    '/api/billing/create-checkout',
    { schema: { tags: ['billing'], body: CreateCheckoutBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { pack_id } = request.body as { pack_id: string };
      const pack = TOKEN_PACKS.find((p) => p.id === pack_id);

      if (!pack) {
        return reply.status(400).send({ detail: 'Invalid pack' });
      }

      const stripe = getStripe();
      if (stripe) {
        const session = await stripe.checkout.sessions.create({
          mode: 'payment',
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: { name: pack.label },
                unit_amount: pack.price,
              },
              quantity: 1,
            },
          ],
          metadata: {
            user_id: userId,
            pack_id: pack.id,
            tokens: String(pack.tokens),
          },
          success_url: `${config.CORS_ALLOW_ORIGINS.split(',')[0]}/settings?payment=success`,
          cancel_url: `${config.CORS_ALLOW_ORIGINS.split(',')[0]}/settings?payment=cancelled`,
        });
        return reply.send({ checkout_url: session.url });
      }

      // Phase 1 / demo: BIBD Pay manual flow — return an order ID
      // TODO: production requires contacting BIBD merchant services
      const orderId = `BIBD-${Date.now().toString(36)}-${userId.slice(0, 6)}`;
      return reply.send({ order_id: orderId, pack, price: pack.price / 100 });
    },
  );

  // ─── Stripe Webhook ───
  app.post(
    '/api/billing/webhook',
    { config: { public: true }, schema: { tags: ['billing'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const stripe = getStripe();
      if (!stripe || !config.STRIPE_WEBHOOK_SECRET) {
        return reply.status(503).send({ detail: 'Webhooks not configured' });
      }

      const sig = request.headers['stripe-signature'] as string;
      const rawBody = (request.body as Buffer).toString();

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          rawBody,
          sig,
          config.STRIPE_WEBHOOK_SECRET,
        );
      } catch {
        return reply.status(400).send({ detail: 'Invalid webhook signature' });
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        const tokens = parseInt(session.metadata?.tokens || '0', 10);
        const paymentId = session.payment_intent as string;

        if (userId && tokens > 0) {
          // Credit tokens
          const [user] = await app.db
            .select()
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

          if (user) {
            await app.db
              .update(users)
              .set({ tokenBalance: user.tokenBalance + tokens })
              .where(eq(users.id, userId));

            await app.db.insert(tokenLedger).values({
              userId,
              changeAmount: tokens,
              reason: 'pack_purchase',
              stripePaymentId: paymentId,
            });
          }
        }
      }

      return reply.status(200).send({ received: true });
    },
  );

  // ─── Payment history ───
  app.get(
    '/api/billing/history',
    { schema: { tags: ['billing'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { desc } = await import('drizzle-orm');

      const history = await app.db
        .select()
        .from(tokenLedger)
        .where(eq(tokenLedger.userId, userId))
        .orderBy(desc(tokenLedger.createdAt))
        .limit(50);

      return reply.send({ data: history });
    },
  );

  // ─── Phase 1 / demo: Manual payment confirmation (BIBD Pay) ───
  // TODO: Replace with webhook/API integration when BIBD provides merchant API access
  const ConfirmBody = Type.Object({
    reference: Type.String({ minLength: 1 }),
  });

  app.post(
    '/api/billing/confirm',
    { schema: { tags: ['billing'], body: ConfirmBody } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;
      const { reference } = request.body as { reference: string };

      // Parse tokens from reference — demo flow credits 100 tokens
      // In production, you'd validate the reference against BIBD's records
      const tokens = 100; // default pack size for manual flow

      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ detail: 'User not found' });
      }

      await app.db
        .update(users)
        .set({ tokenBalance: user.tokenBalance + tokens })
        .where(eq(users.id, userId));

      await app.db.insert(tokenLedger).values({
        userId,
        changeAmount: tokens,
        reason: 'pack_purchase',
        stripePaymentId: reference,
      });

      return reply.send({
        detail: `Credited ${tokens} tokens`,
        balance: user.tokenBalance + tokens,
      });
    },
  );
});
