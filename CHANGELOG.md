# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial public release with core CRM features
- Lead management system with pipeline tracking
- Dashboard with real-time sales metrics
- Task management system
- Manual call outcome logging and call history; interactive dialer disabled pending funded Twilio integration
- Analytics dashboard with call charts and pipeline breakdown
- Template-based website generator per lead
- Multi-tenant architecture with organization isolation
- Authentication with NextAuth.js
- Comprehensive test suite with Vitest

### Security

- Input validation on all tRPC procedures using Zod
- Authentication and authorization on all protected endpoints
- Secure session management with JWT
- Environment variable validation

## [0.1.0] - 2026-04-19

### Added

- Initial project setup
- Next.js 15 with App Router
- tRPC API layer
- Prisma ORM with PostgreSQL
- Shadcn/UI component library
- NextAuth.js authentication
- Vitest testing framework
- ESLint configuration
- TypeScript configuration

[Unreleased]: https://github.com/yourusername/crm/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/yourusername/crm/releases/tag/v0.1.0
