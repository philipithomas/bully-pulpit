import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { type Login, logins } from '@/lib/db/schema'

export const MAX_VERIFICATION_ATTEMPTS = 5

export type TokenType = 'code' | 'magic_link'

export async function createLogin(input: {
  subscriberId: number
  token: string
  tokenType: TokenType
  expiredAt: Date
}): Promise<Login> {
  const rows = await getDb()
    .insert(logins)
    .values({
      subscriberId: input.subscriberId,
      token: input.token,
      tokenType: input.tokenType,
      expiredAt: input.expiredAt,
    })
    .returning()
  return rows[0]
}

/**
 * Code-type lookups must pass `subscriberId` so a 6-digit code only matches
 * the account it was minted for — a global match would sign a session for
 * whatever account a guessed code happens to belong to.
 */
export async function findValidByToken(
  token: string,
  tokenType: TokenType,
  subscriberId?: number
): Promise<Login | null> {
  const rows = await getDb()
    .select()
    .from(logins)
    .where(
      and(
        eq(logins.token, token),
        eq(logins.tokenType, tokenType),
        ...(subscriberId !== undefined
          ? [eq(logins.subscriberId, subscriberId)]
          : []),
        isNull(logins.verifiedAt),
        isNull(logins.lockedAt),
        sql`${logins.expiredAt} > NOW()`
      )
    )
    .limit(1)
  return rows[0] ?? null
}

/**
 * Finds the newest live code issued through the normal email sign-in flow.
 * Development's fixed local PIN uses this row so it preserves expiration,
 * lockout, verification, and first-confirmation behavior without depending on
 * the randomly generated code value.
 */
export async function findValidCodeForSubscriber(
  subscriberId: number
): Promise<Login | null> {
  const rows = await getDb()
    .select()
    .from(logins)
    .where(
      and(
        eq(logins.subscriberId, subscriberId),
        eq(logins.tokenType, 'code'),
        isNull(logins.verifiedAt),
        isNull(logins.lockedAt),
        sql`${logins.expiredAt} > NOW()`
      )
    )
    .orderBy(desc(logins.id))
    .limit(1)
  return rows[0] ?? null
}

/**
 * Increments the attempt counter for a subscriber's live `code` logins and
 * locks them once attempts reach MAX_VERIFICATION_ATTEMPTS.
 */
export async function incrementAttemptsForSubscriber(
  subscriberId: number
): Promise<void> {
  await getDb().execute(sql`
    UPDATE ${logins}
    SET attempts = attempts + 1,
        locked_at = CASE
          WHEN attempts + 1 >= ${MAX_VERIFICATION_ATTEMPTS} THEN NOW()
          ELSE locked_at
        END
    WHERE ${logins.subscriberId} = ${subscriberId}
      AND ${logins.tokenType} = 'code'
      AND ${logins.verifiedAt} IS NULL
      AND ${logins.lockedAt} IS NULL
      AND ${logins.expiredAt} > NOW()
  `)
}

export async function markVerified(id: number): Promise<void> {
  await getDb()
    .update(logins)
    .set({ verifiedAt: sql`NOW()` })
    .where(eq(logins.id, id))
}

export async function markEmailSent(id: number): Promise<void> {
  await getDb()
    .update(logins)
    .set({ emailSentAt: sql`NOW()` })
    .where(eq(logins.id, id))
}
