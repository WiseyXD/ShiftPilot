import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { compare } from "bcryptjs"
import { prisma } from "@/prisma/client"
import type { StripePlan } from "@/prisma/generated/client/client"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      stripePlan: StripePlan
    }
  }
  interface User {
    stripePlan: StripePlan
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        })
        if (!user) return null

        const valid = await compare(
          credentials.password as string,
          user.passwordHash
        )
        if (!valid) return null

        return {
          id: user.id,
          email: user.email,
          stripePlan: user.stripePlan,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.stripePlan = user.stripePlan
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.stripePlan = token.stripePlan as StripePlan
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
})
