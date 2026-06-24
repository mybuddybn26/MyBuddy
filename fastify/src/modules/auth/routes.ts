import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { hash, compare } from 'bcryptjs';
import { Type } from '@sinclair/typebox';
import { users } from '../../db/schema.js';

const RegisterBody = Type.Object({
  phone_email: Type.String({ minLength: 3 }),
  password: Type.String({ minLength: 6 }),
  display_name: Type.Optional(Type.String()),
});

const LoginBody = Type.Object({
  phone_email: Type.String({ minLength: 3 }),
  password: Type.String({ minLength: 1 }),
});

export default fp(async (app: FastifyInstance) => {
  // ─── Register ───
  app.post(
    '/api/auth/register',
    {
      config: { public: true },
      schema: { tags: ['auth'], body: RegisterBody },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { phone_email, password, display_name } = request.body as {
        phone_email: string;
        password: string;
        display_name?: string;
      };

      const t0 = performance.now();

      // Check if user exists
      const [existing] = await app.db
        .select()
        .from(users)
        .where(eq(users.phoneEmail, phone_email))
        .limit(1);

      if (existing) {
        return reply.status(409).send({ detail: 'User already exists' });
      }

      const tHash = performance.now();
      const passwordHash = await hash(password, 10);
      const tHashEnd = performance.now();

      const [user] = await app.db
        .insert(users)
        .values({
          phoneEmail: phone_email,
          passwordHash,
          displayName: display_name || 'User',
        })
        .returning();

      const tJwt = performance.now();
      const token = app.jwt.sign(
        { sub: user.id, email: user.phoneEmail, name: user.displayName },
        { expiresIn: '7d' },
      );

      const refreshToken = app.jwt.sign(
        { sub: user.id, type: 'refresh' },
        { expiresIn: '30d' },
      );
      const tEnd = performance.now();

      request.log.info(
        {
          route: 'register',
          db_lookup_ms: Math.round(tHash - t0),
          bcrypt_hash_ms: Math.round(tHashEnd - tHash),
          jwt_sign_ms: Math.round(tEnd - tJwt),
          total_ms: Math.round(tEnd - t0),
        },
        'auth timing',
      );

      return reply.status(201).send({
        access_token: token,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          phone_email: user.phoneEmail,
          display_name: user.displayName,
          ai_persona: user.aiPersona,
          token_balance: user.tokenBalance,
        },
      });
    },
  );

  // ─── Login ───
  app.post(
    '/api/auth/login',
    {
      config: { public: true },
      schema: { tags: ['auth'], body: LoginBody },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { phone_email, password } = request.body as {
        phone_email: string;
        password: string;
      };

      const t0 = performance.now();

      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.phoneEmail, phone_email))
        .limit(1);

      const tVerify = performance.now();
      const valid = user ? await compare(password, user.passwordHash) : false;
      const tVerifyEnd = performance.now();

      if (!valid) {
        return reply.status(401).send({ detail: 'Invalid credentials' });
      }

      const tJwt = performance.now();
      const token = app.jwt.sign(
        { sub: user.id, email: user.phoneEmail, name: user.displayName },
        { expiresIn: '7d' },
      );

      const refreshToken = app.jwt.sign(
        { sub: user.id, type: 'refresh' },
        { expiresIn: '30d' },
      );
      const tEnd = performance.now();

      request.log.info(
        {
          route: 'login',
          db_lookup_ms: Math.round(tVerify - t0),
          bcrypt_verify_ms: Math.round(tVerifyEnd - tVerify),
          jwt_sign_ms: Math.round(tEnd - tJwt),
          total_ms: Math.round(tEnd - t0),
        },
        'auth timing',
      );

      return reply.send({
        access_token: token,
        refresh_token: refreshToken,
        user: {
          id: user.id,
          phone_email: user.phoneEmail,
          display_name: user.displayName,
          ai_persona: user.aiPersona,
          token_balance: user.tokenBalance,
        },
      });
    },
  );

  // ─── Refresh Token ───
  app.post(
    '/api/auth/refresh',
    {
      config: { public: true },
      schema: { tags: ['auth'] },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { refresh_token } = request.body as { refresh_token: string };

      try {
        const decoded = app.jwt.verify<{ sub: string; type: string }>(
          refresh_token,
        );
        if (decoded.type !== 'refresh') {
          return reply.status(401).send({ detail: 'Invalid refresh token' });
        }

        const [user] = await app.db
          .select()
          .from(users)
          .where(eq(users.id, decoded.sub))
          .limit(1);

        if (!user) {
          return reply.status(401).send({ detail: 'User not found' });
        }

        const token = app.jwt.sign(
          { sub: user.id, email: user.phoneEmail, name: user.displayName },
          { expiresIn: '7d' },
        );

        const newRefresh = app.jwt.sign(
          { sub: user.id, type: 'refresh' },
          { expiresIn: '30d' },
        );

        return reply.send({
          access_token: token,
          refresh_token: newRefresh,
        });
      } catch {
        return reply.status(401).send({ detail: 'Invalid or expired token' });
      }
    },
  );

  // ─── Me (current user profile) ───
  app.get(
    '/api/auth/me',
    { schema: { tags: ['auth'] } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.authUser!.sub;

      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ detail: 'User not found' });
      }

      return reply.send({
        id: user.id,
        phone_email: user.phoneEmail,
        display_name: user.displayName,
        ai_persona: user.aiPersona,
        token_balance: user.tokenBalance,
        subscription_tier: user.subscriptionTier,
        created_at: user.createdAt,
      });
    },
  );
});
