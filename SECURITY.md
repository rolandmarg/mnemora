# Security Guide

This document explains the security safeguards implemented in Mnemora to prevent unauthorized operations.

## Security Features

### 1. Deletion Protection

**All deletion operations are completely disabled** to prevent unauthorized deletion of birthday events.

#### Disabled Operations:
- `delete-events.ts` script - Exits immediately with security error
- `CalendarDataSource.delete()` - Throws SecurityError
- `CalendarDataSource.deleteAll()` - Throws SecurityError
- `BirthdayService.deleteAllBirthdays()` - Throws SecurityError
- `GoogleCalendarClient.deleteEvent()` - Throws SecurityError
- `GoogleCalendarClient.deleteAllEvents()` - Throws SecurityError

#### Behavior:
- All deletion attempts are **audit logged** before throwing errors
- Error messages clearly indicate deletion is disabled for security
- If you need to delete events, you must do so manually through Google Calendar

### 2. Production Environment Protection

**Manual send scripts are disabled in production** to prevent unauthorized message sending.

#### Protected Scripts:
- `manual-send.ts` - Blocked in production
- `send-test-message-whatsapp.ts` - Blocked in production
- `send-monthly-digest-whatsapp.ts` - Blocked in production

#### Environment Detection:
- Uses `NODE_ENV` environment variable
- Production: `NODE_ENV=production` → Scripts are blocked
- Development: `NODE_ENV=development` or unset → Scripts are allowed

#### Behavior:
- Scripts check environment at startup
- If in production, script exits immediately with security error
- All blocked attempts are **audit logged**
- Main birthday check (`index.ts`/`index-core.ts`) **always works** regardless of environment

### 3. Audit Logging

All security-sensitive operations are logged for monitoring and compliance.

#### Logged Events:
- **Deletion attempts**: Method name, parameters, timestamp, environment
- **Manual send attempts**: Script name, recipient, message details, blocked status
- **Security violations**: Type, reason, environment, correlation ID

#### Log Format:
- Structured JSON logs with `audit: true` flag
- Includes correlation ID for tracing
- Includes environment and timestamp
- Logged to CloudWatch in Lambda, console in local

## Environment Configuration

### Development Mode
```bash
# Allow manual scripts
NODE_ENV=development yarn manual-send
# or
yarn manual-send  # Defaults to development if NODE_ENV not set
```

### Production Mode
```bash
# Block manual scripts
NODE_ENV=production yarn manual-send
# ❌ SECURITY ERROR: Manual send is disabled in production

# Main birthday check always works
NODE_ENV=production yarn start
# ✅ Works normally
```

## Security Best Practices

1. **Never commit production credentials** - Use environment variables
2. **Use production mode in Lambda** - Set `NODE_ENV=production` in Lambda environment
3. **Review audit logs regularly** - Monitor for unauthorized access attempts
4. **Limit repository access** - Only share with trusted engineers
5. **Use read-only calendar permissions** - Service account should have minimal permissions

## Troubleshooting

### "Deletion is disabled for security reasons"
- **Expected behavior**: Deletion operations are intentionally disabled
- **Solution**: Delete events manually through Google Calendar if needed

### "Manual send is disabled in production"
- **Expected behavior**: Manual scripts are blocked in production
- **Solution**: Set `NODE_ENV=development` for local testing, or use scheduled execution

### Audit logs not appearing
- Check logger configuration
- Verify correlation ID is initialized
- Check CloudWatch Logs in Lambda environment

## Security Contact

If you discover a security vulnerability, please:
1. Do not open a public issue
2. Contact the repository maintainer directly
3. Provide details about the vulnerability

