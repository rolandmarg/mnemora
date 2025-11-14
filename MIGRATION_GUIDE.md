# WhatsApp Cloud API Migration Guide

Guide for migrating from `whatsapp-web.js` to WhatsApp Cloud API.

## Why Migrate?

### Current Implementation (whatsapp-web.js)
- ✅ Works locally and in Lambda (with S3 session storage)
- ✅ No API costs
- ❌ Requires QR code authentication
- ❌ Session management complexity
- ❌ Not officially supported by WhatsApp
- ❌ May violate WhatsApp ToS for automated use

### WhatsApp Cloud API
- ✅ Official WhatsApp API
- ✅ No QR codes (uses API tokens)
- ✅ Better for serverless/cloud
- ✅ ToS compliant
- ✅ More reliable
- ❌ Requires Meta Business Account
- ❌ Has API costs (free tier available)
- ❌ More complex setup

## Prerequisites

1. **Meta Business Account** ([Create one](https://business.facebook.com/))
2. **WhatsApp Business Account** (linked to Meta Business)
3. **Meta App** with WhatsApp product
4. **Access Token** from Meta App
5. **Phone Number ID** from WhatsApp Business Account
6. **Business Account ID** from Meta Business

## Migration Steps

### Step 1: Set Up Meta Business Account

1. Go to [Meta Business Suite](https://business.facebook.com/)
2. Create or select a business account
3. Add WhatsApp Business Account
4. Verify business (may require business verification)

### Step 2: Create Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app
3. Add "WhatsApp" product
4. Get **App ID** and **App Secret**

### Step 3: Get Access Token

1. In Meta App → WhatsApp → API Setup
2. Get **Temporary Access Token** (for testing)
3. For production, set up **System User** with **Permanent Token**
4. Save token securely (use AWS Secrets Manager)

### Step 4: Get Phone Number ID

1. In Meta App → WhatsApp → API Setup
2. Find **Phone number ID** (starts with `+`)
3. Save this ID

### Step 5: Get Business Account ID

1. In Meta Business Suite → Settings
2. Find **Business Account ID**
3. Save this ID

### Step 6: Implement WhatsApp Cloud API Channel

Update `src/channels/whatsapp-cloud-api.channel.ts`:

```typescript
import { BaseOutputChannel } from '../base/base-output-channel.js';
import type { SendOptions, SendResult } from '../interfaces/output-channel.interface.js';
import type { AppConfig } from '../config.js';

export class WhatsAppCloudAPIOutputChannel extends BaseOutputChannel {
  private accessToken: string;
  private phoneNumberId: string;
  private businessAccountId: string;
  private apiVersion: string = 'v21.0';

  constructor(config: AppConfig) {
    super();
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    this.businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || '';
  }

  async send(message: string, options?: SendOptions): Promise<SendResult> {
    const groupId = options?.recipients?.[0] || this.config.whatsapp.groupId;
    
    if (!groupId) {
      return {
        success: false,
        error: new Error('No WhatsApp group ID specified'),
      };
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: groupId,
            type: 'text',
            text: {
              body: message,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: new Error(error.error?.message || 'Failed to send message'),
        };
      }

      const data = await response.json();
      return {
        success: true,
        messageId: data.messages[0].id,
        recipient: groupId,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  isAvailable(): boolean {
    return !!(
      this.accessToken &&
      this.phoneNumberId &&
      this.businessAccountId
    );
  }

  getMetadata(): OutputChannelMetadata {
    return {
      name: 'WhatsApp (Cloud API)',
      type: 'whatsapp-cloud-api',
      description: 'Sends WhatsApp messages via official WhatsApp Cloud API',
      supportsSingleRecipient: true,
      supportsMultipleRecipients: false,
      capabilities: ['whatsapp', 'cloud-api', 'no-qr-code'],
    };
  }
}
```

### Step 7: Update Factory

Update `src/factories/output-channel.factory.ts`:

```typescript
export class OutputChannelFactory {
  static createWhatsAppOutputChannel(config: AppConfig): OutputChannel {
    // Feature flag: use Cloud API if configured
    const useCloudAPI = process.env.WHATSAPP_USE_CLOUD_API === 'true';
    
    if (useCloudAPI) {
      return new WhatsAppCloudAPIOutputChannel(config);
    }
    
    // Default: use whatsapp-web.js
    return new WhatsAppOutputChannel(config);
  }
}
```

### Step 8: Update Configuration

Add to `src/config.ts`:

```typescript
export interface WhatsAppConfig {
  groupId: string | undefined;
  headless: boolean;
  useCloudAPI: boolean;
  accessToken: string | undefined;
  phoneNumberId: string | undefined;
  businessAccountId: string | undefined;
}
```

Add environment variables:
- `WHATSAPP_USE_CLOUD_API=true`
- `WHATSAPP_ACCESS_TOKEN=your-token`
- `WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id`
- `WHATSAPP_BUSINESS_ACCOUNT_ID=your-business-account-id`

### Step 9: Update SAM Template

Add to `template.yaml`:

```yaml
Environment:
  Variables:
    WHATSAPP_USE_CLOUD_API: 'true'
    WHATSAPP_ACCESS_TOKEN: !Ref WhatsAppAccessToken  # From Secrets Manager
    WHATSAPP_PHONE_NUMBER_ID: !Ref WhatsAppPhoneNumberId
    WHATSAPP_BUSINESS_ACCOUNT_ID: !Ref WhatsAppBusinessAccountId
```

### Step 10: Test Migration

1. **Test locally** with Cloud API:
   ```bash
   WHATSAPP_USE_CLOUD_API=true yarn start
   ```

2. **Verify messages sent** to WhatsApp group

3. **Check metrics** in CloudWatch

4. **Monitor for errors**

### Step 11: Deploy to Lambda

1. Update environment variables in SAM template
2. Deploy:
   ```bash
   sam deploy
   ```

3. **Test in Lambda**:
   - Manually invoke function
   - Check CloudWatch Logs
   - Verify messages sent

### Step 12: Remove whatsapp-web.js (Optional)

Once Cloud API is stable:

1. Remove `whatsapp-web.js` dependency:
   ```bash
   yarn remove whatsapp-web.js
   ```

2. Remove S3 session storage (no longer needed)

3. Remove QR code authentication code

4. Update documentation

## Rollback Plan

If migration fails:

1. **Set feature flag**:
   ```bash
   WHATSAPP_USE_CLOUD_API=false
   ```

2. **Redeploy** with whatsapp-web.js

3. **Investigate issues** with Cloud API

4. **Fix and retry** migration

## Cost Comparison

### whatsapp-web.js
- **Cost**: $0 (no API costs)
- **Infrastructure**: S3 for session storage (~$0.01/month)

### WhatsApp Cloud API
- **Free Tier**: 1,000 conversations/month
- **Paid**: $0.005-$0.09 per conversation (varies by country)
- **Infrastructure**: No S3 needed

**For 30 messages/month**: Both are effectively free.

## When to Use Each

### Use whatsapp-web.js when:
- ✅ Testing/development
- ✅ Low message volume (< 100/month)
- ✅ No Meta Business Account
- ✅ Want zero API costs

### Use WhatsApp Cloud API when:
- ✅ Production deployment
- ✅ High message volume
- ✅ Need reliability
- ✅ Want ToS compliance
- ✅ Have Meta Business Account

## Troubleshooting

### Authentication Errors
- Verify access token is valid
- Check token expiration
- Verify phone number ID is correct

### Message Send Failures
- Check group ID format
- Verify phone number is registered
- Check rate limits
- Review API error responses

### Rate Limits
- WhatsApp Cloud API has rate limits
- Implement retry logic with exponential backoff
- Monitor rate limit metrics

## Resources

- [WhatsApp Cloud API Documentation](https://developers.facebook.com/docs/whatsapp/cloud-api)
- [Meta for Developers](https://developers.facebook.com/)
- [WhatsApp Business API Pricing](https://developers.facebook.com/docs/whatsapp/pricing)

