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

The initial database foundation covers profiles, feed posts/comments/reactions, dating profiles, events/attendance, groups/membership, message requests/conversations/messages, wallet records, XP, and notifications. RLS is enabled. Anonymous feed reads use a view that omits author IDs; VIP status cannot be changed through ordinary profile updates; private conversation membership is protected; message requests use transactional RPCs that prevent self-requests and atomically create chats on acceptance. The initial React UI includes sign-up/sign-in, the feed composer, and a message-request inbox/direct-chat panel. Other feature sections and economy/admin transactional rules are still under construction.

## Local development

1. Copy `.env.example` to `.env.local` and set the Supabase publishable key.
2. Run `npm install`.
3. Run `npm run dev`.
4. Run `npm run build` to type-check and create a production build.

A GitHub Actions workflow runs the production build on pushes and pull requests.
