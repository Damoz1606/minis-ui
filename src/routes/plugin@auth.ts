import { QwikAuth$ } from "@auth/qwik";
import Keycloak from "@auth/qwik/providers/keycloak";
import Credentials from "@auth/qwik/providers/credentials";
import { prisma } from "~/prisma";
import { Account } from "~/generated/prisma/client";
import * as v from "valibot";
import type { Provider } from "@auth/qwik/providers"
import { PrismaAdapter } from "@auth/prisma-adapter";


const keycloakProvider = "keycloak"
const refreshError = "RefreshTokenError"

const LoginSchema = v.object({
  username: v.pipe(
    v.string('Your username must be a string.'),
    v.nonEmpty('Please enter your username.'),
  ),
  password: v.pipe(
    v.string('Your password must be a string.'),
    v.nonEmpty('Please enter your password.'),
    v.minLength(8, 'Your password must have 8 characters or more.')
  ),
});

const providers: Provider[] = [
  Credentials({
    credentials: {
      username: { label: "Username", type: "text" },
      password: { label: "Password", type: "password" }
    },
    authorize: async ({ ...request }) => {
      const validated = v.safeParse(LoginSchema, request)

      if (!validated.success) {
        console.error("Validation error:", validated.issues)
        return null
      }

      const { username, password } = validated.output

      const url = process.env.AUTH_CREDENTIALS_URL!;
      const response = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({
          client_id: process.env.AUTH_CREDENTIALS_ID!,
          client_secret: process.env.AUTH_CREDENTIALS_SECRET!,
          grant_type: "password",
          username: username,
          password: password,
        })
      })

      if (!response.ok) return null

      return (await response.json()) ?? null
    }
  }),
  Keycloak({
    issuer: process.env.AUTH_KEYCLOAK_ISSUER!,
  }),
]

const providerNameMap = providers
  .map((provider) => {
    if (typeof provider === "function") {
      const providerData = provider()
      return providerData.name.toLowerCase()
    } else {
      return provider.name.toLowerCase()
    }
  });

export const providerMap = providers
  .map((provider) => {
    if (typeof provider === "function") {
      const providerData = provider()
      return { id: providerData.id, name: providerData.name }
    } else {
      return { id: provider.id, name: provider.name }
    }
  })
  .filter((provider) => provider.id !== "credentials")

export const { onRequest, useSession, useSignIn, useSignOut } = QwikAuth$(
  () => ({
    secret: process.env.AUTH_SECRET,
    providers: providers,
    adapter: PrismaAdapter(prisma),
    callbacks: {
      session: async ({ session, user }) => {
        const accounts = await findAccounts(user.id, providerNameMap)
        const [account] = accounts

        if (canRefresh(account)) {
          try {
            const newToken = await refreshToken(account.refresh_token!)
            await updateAccount(newToken, { ...account })
          } catch (error) {
            console.error("Error refreshing access_token", error)
            session.error = refreshError
          }
        }

        return session;
      }
    }
  })
)

type Token = {
  access_token: string
  expires_in: number
  refresh_token?: string
}

const canRefresh = (account: Account) =>
  account.refresh_token &&
  account.expires_at &&
  account.expires_at * 1000 < Date.now()

const findAccounts = async (id: string, provider: string[]): Promise<Account[]> => prisma.account.findMany({
  where: { userId: id, provider: { in: provider } },
})

const updateAccount = async (newToken: Token, account: {
  refresh_token: string | null, providerAccountId: string
}): Promise<Account> => await prisma.account.update({
  data: {
    access_token: newToken.access_token,
    expires_at: Math.floor(Date.now() / 1000 + newToken.expires_in),
    refresh_token: newToken.refresh_token ?? account.refresh_token
  },
  where: {
    provider_providerAccountId: {
      provider: keycloakProvider,
      providerAccountId: account.providerAccountId
    }

  }
})

const refreshToken = async (refreshToken: string): Promise<Token> => {
  const response = await fetch(process.env.AUTH_KEYCLOAK_REFRESH_TOKEN_URL!, {
    method: "POST",
    body: new URLSearchParams({
      client_id: process.env.AUTH_KEYCLOAK_ID!,
      client_secret: process.env.AUTH_KEYCLOAK_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })
  });

  const tokensOrError = await response.json()

  if (!response.ok) throw tokensOrError

  return tokensOrError as Token
}

declare module "@auth/qwik" {
  interface Session {
    error?: "RefreshTokenError"
  }
}