# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in Open CRM, please **do not** open a public issue. Instead, please report it privately through GitHub's [private vulnerability reporting](https://github.com/JMAN730/OPENCRM/security/advisories/new) (the **Report a vulnerability** button under the repository's **Security** tab) with the following information:

- A clear description of the vulnerability
- Steps to reproduce the issue
- Potential impact of the vulnerability
- Suggested fix (if you have one)

We will acknowledge receipt of your report within 48 hours and provide a more detailed response within 5 business days.

## Security Best Practices

When deploying Open CRM, please follow these security best practices:

### Environment Variables

- **Never commit `.env` files** to version control
- Keep `.env.local` in your `.gitignore` (already configured)
- Use strong, randomly generated `NEXTAUTH_SECRET`
- Rotate secrets regularly in production

### Database Security

- Use strong passwords for PostgreSQL
- Enable PostgreSQL SSL connections in production
- Restrict database access to application servers only
- Enable automated backups
- Keep PostgreSQL updated to latest security patches

### Authentication

- Enable HTTPS in production (enforced by Next.js)
- Use strong session secrets
- Implement rate limiting on login endpoints
- Consider enabling multi-factor authentication for admin accounts
- Regularly audit user access and permissions

### API Security

- All tRPC procedures with data access use `protectedProcedure`
- Input validation via Zod schemas on all procedures
- Organization/tenant isolation enforced on all queries
- CSRF protection enabled by default in Next.js

### Dependencies

- Keep all dependencies updated: `npm audit` and `npm update`
- Monitor security advisories: `npm audit`
- Review dependency updates in pull requests
- Use lock files (`package-lock.json`) for reproducible builds

### Deployment

- Run in production mode (`npm run build && npm run start`)
- Enable security headers via Next.js configuration
- Use environment-specific secrets management (AWS Secrets Manager, Vercel, etc.)
- Enable logging and monitoring
- Keep Node.js runtime updated

### Third-Party Services

If using optional integrations:

- **Twilio**: Secure API credentials, enable request signing
- **DeepSeek**: Use project-specific API keys, monitor usage
- **AWS S3**: Use IAM roles with least privilege, enable versioning and encryption

## Security Headers

Open CRM includes security headers configured in Next.js. Review and customize as needed:

- Content Security Policy (CSP)
- X-Content-Type-Options
- X-Frame-Options
- X-XSS-Protection
- Referrer-Policy

## Data Privacy

- Personal data is scoped to organizations
- No data is shared between tenants
- GDPR compliance considerations:
  - Implement data export functionality
  - Implement data deletion workflows
  - Maintain audit logs of data access

## Incident Response

If a security incident occurs:

1. Assess the scope and impact
2. Notify affected users if data was compromised
3. Document the incident
4. Implement fixes and deploy patches
5. Post-incident review and improvements

## Keeping Up with Security

- Subscribe to [Node.js security updates](https://nodejs.org/en/security/)
- Follow [OWASP](https://owasp.org/) security guidelines
- Regular security audits of code and dependencies
- Implement automated security scanning in CI/CD

## Questions?

If you have security-related questions or concerns, please open a private report through GitHub's [private vulnerability reporting](https://github.com/JMAN730/OPENCRM/security/advisories/new).
