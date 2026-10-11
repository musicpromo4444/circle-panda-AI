# Circle Panda AI Rebuild

A clean rebuild of Circle Panda using React, TypeScript, Vite, and Supabase.

## Project boundaries

- This repository and the `Circle Panda Rebuilt` Supabase project are separate from the existing production application.
- Never commit Supabase service-role keys or other secrets. Configure public client values as deployment environment variables.
- Database schema changes belong in `supabase/migrations/` and must be applied to the rebuild project only.

## Supabase project

- Project ref: `chcyncvieekjousgzlrg`
- Region: `eu-west-1`
- API URL: `https://chcyncvieekjousgzlrg.supabase.co`

## Status

The initial database foundation covers profiles, feed posts/comments/reactions, dating profiles, events/attendance, groups/membership, messaging requests/conversations/messages, wallet records, XP, and notifications. Feature-specific transactional logic, tighter authorization policies, UI, and automated tests remain to be implemented.
