# Contributing to Open CRM

First, thank you for considering contributing! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## How Can I Contribute?

### Reporting Bugs

Before creating a bug report, please check the issue list to avoid duplicates. When creating a bug report, include as much detail as possible:

- **Use a clear, descriptive title**
- **Describe the exact steps to reproduce the issue**
- **Provide specific examples to demonstrate the steps**
- **Describe the observed behavior and what you expected**
- **Include screenshots or GIFs if possible**
- **Include your environment:** OS, Node version, database setup, etc.

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear, descriptive title**
- **Provide a step-by-step description of the suggested enhancement**
- **Provide specific examples to demonstrate the feature**
- **Explain why this enhancement would be useful**
- **List some other CRMs or tools where you've seen similar functionality**

### Pull Requests

- Follow the [Development Setup](#development-setup) instructions
- Follow the code style guidelines (see [Code Style](#code-style))
- Include appropriate test cases
- Update documentation as needed
- End all files with a newline

## Development Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/YOUR-USERNAME/crm.git
   cd crm
   ```

2. **Create a feature branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Set up environment:**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your database URL and other configs
   ```

5. **Initialize database:**
   ```bash
   npx prisma db push
   ```

6. **Make your changes** and test thoroughly

7. **Commit with a clear message:**
   ```bash
   git commit -m "feat: add new lead filtering option"
   ```

8. **Push to your fork and create a Pull Request**

## Code Style

### TypeScript & JavaScript

- Use TypeScript for all new code
- Follow ESLint configuration (`npm run lint`)
- Use meaningful variable and function names
- Write self-documenting code with comments for complex logic
- Keep functions focused and small (under 50 lines when possible)

### Component Guidelines

- Functional components with hooks only (no class components)
- Use TypeScript interfaces for all props
- Keep components in feature folders with related logic
- Co-locate tests with components (`.test.tsx` files)

```typescript
interface MyComponentProps {
  title: string;
  onAction?: (value: string) => void;
}

export function MyComponent({ title, onAction }: MyComponentProps) {
  return <div>{title}</div>;
}
```

### API Routes & tRPC Procedures

- Validate all inputs using Zod
- Always check user authorization in `protectedProcedure` handlers
- Include appropriate error handling with meaningful messages
- Apply organization/tenant filtering

```typescript
export const myRouter = createTRPCRouter({
  getItems: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const item = await ctx.prisma.item.findUnique({
        where: { id: input.id },
      });
      
      if (!item || item.organizationId !== ctx.session.user.organizationId) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Not found or unauthorized",
        });
      }
      
      return item;
    }),
});
```

### Database Schema

- Use descriptive field names
- Add indexes for frequently queried fields
- Include `createdAt` and `updatedAt` timestamps
- Document complex relationships with comments
- Always scope data to `organizationId` for multi-tenant safety

## Testing

All contributions should include appropriate tests.

- Run tests before committing: `npx vitest run`
- Write tests for new features and bug fixes
- Test edge cases and error scenarios
- Aim for at least 80% coverage on new code

Example test:

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyComponent } from './MyComponent';

describe('MyComponent', () => {
  it('renders the title prop', () => {
    render(<MyComponent title="Test Title" />);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });
});
```

## Commit Messages

Follow the Conventional Commits format:

```
feat: add new lead filtering option
fix: resolve issue with lead search
docs: update installation instructions
style: format code with prettier
refactor: simplify lead query logic
test: add tests for lead filtering
chore: update dependencies
```

Format:
```
<type>(<scope>): <subject>

<body>

<footer>
```

## Pull Request Process

1. **Update documentation** (README, ARCHITECTURE, etc.)
2. **Add/update tests** for your changes
3. **Run linting and tests:**
   ```bash
   npm run lint
   npx vitest run
   ```
4. **Fill out the PR template** completely
5. **Link related issues** in the PR description
6. **Request review** from maintainers
7. **Address review feedback** in follow-up commits
8. **Squash commits** before merging if requested

## Release Process

Releases are made by maintainers following semantic versioning:

- `MAJOR.MINOR.PATCH` (e.g., 1.2.3)
- Update version in `package.json`
- Update `CHANGELOG.md`
- Create git tag and GitHub release

## Questions?

- Check existing [Discussions](https://github.com/yourusername/crm/discussions)
- Open a new Discussion for questions
- Review [ARCHITECTURE.md](ARCHITECTURE.md) for technical details

Thank you for contributing to Open CRM! 🚀
