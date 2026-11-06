# Join codes

New people create their own account at **/join** with a three-word code run together (e.g. `MapleRiverTeapot`; capitals only for reading, typing is case-insensitive) that only
the admin can see, on **/admin**.

- A new code starts every **Monday (Sydney time)** and is accepted for **two weeks**, so last week's code keeps
  working for a week of grace. The week's code is made the first time /admin is opened that week.
- Each code can make at most **10 accounts**. **Stop codes and make a new one** ends every accepted code at once.
- New people can't open any tool until you tick **DBS access** for them on /admin. Their display name comes from the join form.
- The check is a `before insert` trigger on `auth.users` (migration `0002_join_codes.sql`), so sign-up from the
  browser can't skip it. The code is removed from the account's metadata once checked.
- Accounts made with **Invite user** in the Supabase dashboard skip the code. **Add user → Create new user**
  in the dashboard is refused (no code): use Invite, or the join code yourself.

## One-off Supabase settings
Authentication → Sign In / Providers:
- **Allow new users to sign up: ON** (the trigger keeps it closed to anyone without a code).
- **Confirm email: ON**, so people prove the email is theirs before they can sign in.

Authentication → URL Configuration: the Site URL must be this app's address, since the
confirmation email links back to it.

## First admin
The first account for simonapps@gmail.com needs no code and becomes the admin (migration `0001_base.sql`).
