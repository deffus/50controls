import NextAuth from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';

const passwordVersion = (hash: string) => createHash('sha256').update(hash).digest('hex');

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (typeof credentials?.email !== 'string' || typeof credentials?.password !== 'string') return null;
        // Legacy signup allowed mixed-case addresses; retain access to those accounts.
        const user = await prisma.user.findFirst({
          where: { email: { equals: credentials.email.trim(), mode: 'insensitive' } },
        });
        if (!user) return null;
        const isValid = await bcrypt.compare(credentials.password as string, user.password);
        if (!isValid) return null;
        return { id: user.id, name: user.name, email: user.email, role: user.role, themePref: user.themePref, passwordVersion: passwordVersion(user.password) };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) {
        token.id = user.id;
        token.passwordVersion = user.passwordVersion;
      }
      if (!token.id || !token.passwordVersion) return null;
      const current = await prisma.user.findUnique({
        where: { id: token.id },
        select: { password: true, role: true, name: true, email: true, themePref: true },
      });
      if (!current || passwordVersion(current.password) !== token.passwordVersion) return null;
      // Never accept role or identity fields submitted via a client session update.
      token.role = current.role;
      token.name = current.name;
      token.email = current.email;
      token.themePref = current.themePref;
      return token;
    },
    async session({ session, token }: any) {
      if (token && session?.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.themePref = token.themePref;
      }
      return session;
    },
  },
});
