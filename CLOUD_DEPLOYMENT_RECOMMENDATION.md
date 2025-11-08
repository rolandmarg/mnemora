# Cloud Deployment Recommendation

## ⚠️ IMPORTANT: Group Messaging Limitation

**WhatsApp Cloud API (official Meta API) has limitations with group messaging:**
- ❌ **Group messaging is NOT fully supported** in the official WhatsApp Cloud API
- ❌ Group messaging was deprecated in the official API around 2020
- ⚠️ Some sources indicate limited support (8 participants max, billing per recipient), but this is unreliable

**For group messaging, you have these options:**

### Option 1: Third-Party WhatsApp API Services (Recommended for Groups)

**Services that support group messaging:**
- **Maytapi** - Unofficial API, supports groups, requires phone connection
- **Whapi.Cloud** - API for group management and messaging
- **Ultramsg** - Supports group messaging via API
- **Wassenger** - Group messaging API

**⚠️ Important Considerations:**
- These are **not official** WhatsApp services
- May violate WhatsApp ToS (risk of account ban)
- Require sharing WhatsApp credentials
- Reliability varies by provider

### Option 2: WhatsApp Cloud API (Official) - Individual Messages Only

**If you can send individual messages instead of group messages:**
- ✅ **No manual login** - Uses API tokens (no QR codes)
- ✅ **No session management** - REST API (no sessions to break)
- ✅ **Free tier** - 1,000 conversations/month free
- ✅ **Cloud-ready** - Perfect for serverless/containers
- ✅ **Official** - ToS compliant, stable, reliable
- ✅ **Scalable** - Handles high volume

**Cost:** Free for first 1,000 conversations/month, then ~$0.005-0.09 per conversation

**Limitation:** Cannot send to groups directly - would need to send individual messages to each group member

---

## Alternative Options for Group Messaging

### Option 2: Maytapi (Third-Party)
- **Pros:** Supports group messaging, API-based, no manual login after setup
- **Cons:** Not official, may violate ToS, requires phone connection initially
- **Best for:** Group messaging when official API doesn't work
- **Cost:** Varies by plan

### Option 3: Whapi.Cloud (Third-Party)
- **Pros:** Group messaging support, good documentation
- **Cons:** Not official, may violate ToS
- **Best for:** Group messaging with API access
- **Cost:** Varies by plan

### Option 4: Twilio WhatsApp API (Alternative to Cloud API)
- **Pros:** Very reliable, excellent documentation, easy setup, unified platform (if you need SMS/Voice too)
- **Cons:** Paid (per message), ~$0.005-0.01 per message, **does NOT support groups**, third-party service
- **Best for:** Production apps that need SMS/Voice/other Twilio services, or want unified messaging platform
- **Note:** This is an **alternative** to WhatsApp Cloud API, not something you use together. See `TWILIO_VS_CLOUD_API.md` for comparison.

### Option 5: 360dialog
- **Pros:** Popular WhatsApp API provider, good free tier
- **Cons:** Third-party dependency, **group support unclear**
- **Best for:** Quick setup with good free tier

---

## ❌ NOT Recommended for Cloud

### whatsapp-web.js (Current)
- ❌ Requires QR code scan (manual intervention)
- ❌ Sessions break frequently
- ❌ Not reliable in headless cloud environments
- ❌ May violate WhatsApp ToS for automation
- ❌ Requires browser process (Puppeteer)

---

## Implementation Steps

### Step 1: Set Up WhatsApp Cloud API

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create a new app → Select "Business" type
3. Add "WhatsApp" product to your app
4. Get your credentials:
   - **Phone Number ID** (from WhatsApp > API Setup)
   - **Access Token** (temporary or permanent)
   - **Business Account ID** (optional)

### Step 2: Update Environment Variables

Add to `.env`:

```env
# WhatsApp Cloud API Configuration
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id  # Optional
WHATSAPP_API_VERSION=v21.0  # Optional, defaults to v21.0

# Keep existing
WHATSAPP_GROUP_ID=your_group_id
```

### Step 3: Install Dependencies

```bash
# Add axios for HTTP requests
yarn add axios

# Remove whatsapp-web.js (no longer needed)
yarn remove whatsapp-web.js qrcode-terminal
```

### Step 4: Replace WhatsApp Service

Replace `src/services/whatsapp.ts` with the Cloud API implementation (see `whatsapp-cloud-api.example.ts`)

### Step 5: Update Config

Update `src/config.ts` to include Cloud API config:

```typescript
export interface WhatsAppConfig {
  groupId: string | undefined;
  phoneNumberId: string | undefined;
  accessToken: string | undefined;
}
```

---

## Cloud Deployment Options

### Option 1: AWS Lambda + EventBridge (Recommended)

**Best for:** Serverless, cost-effective, auto-scaling

**Setup:**
1. Package app as Lambda function
2. Create EventBridge rule for daily 9am execution
3. Configure environment variables in Lambda

**Cost:** ~$0.20/month (1 execution/day)

**Pros:**
- Pay per execution
- Auto-scaling
- No server management
- Built-in scheduling

**Cons:**
- Cold starts (minimal for daily job)
- 15-minute timeout limit

---

### Option 2: Google Cloud Functions + Cloud Scheduler

**Best for:** Serverless, integrates with Google Calendar API

**Setup:**
1. Deploy as Cloud Function
2. Create Cloud Scheduler job (cron: `0 9 * * *`)
3. Configure environment variables

**Cost:** ~$0.20/month (1 execution/day)

**Pros:**
- Pay per execution
- Auto-scaling
- Good integration with Google services
- Built-in scheduling

**Cons:**
- Cold starts
- 9-minute timeout (can be extended)

---

### Option 3: Railway / Render

**Best for:** Simple deployment, good free tier

**Setup:**
1. Connect GitHub repo
2. Set environment variables
3. Use built-in cron or external scheduler

**Cost:** Free tier available, then ~$5-10/month

**Pros:**
- Easy deployment
- Good free tier
- Auto-deploy from Git

**Cons:**
- Always-on (uses resources even when idle)
- Free tier limitations

---

### Option 4: Google Cloud Run + Cloud Scheduler

**Best for:** Containerized, flexible, serverless

**Setup:**
1. Build Docker container
2. Deploy to Cloud Run
3. Create Cloud Scheduler job

**Cost:** ~$0.20/month (1 execution/day)

**Pros:**
- Pay per execution
- Containerized (flexible)
- Auto-scaling
- Built-in scheduling

**Cons:**
- Requires Docker setup
- Cold starts

---

### Option 5: VPS with Cron (Traditional)

**Best for:** Full control, always-on

**Setup:**
1. Deploy to VPS (DigitalOcean, Linode, etc.)
2. Set up cron job: `0 9 * * * /path/to/node /path/to/app`
3. Use PM2 or systemd to keep process running

**Cost:** ~$5-10/month

**Pros:**
- Full control
- No cold starts
- Can run other services

**Cons:**
- Always-on (uses resources)
- Server management required
- More expensive

---

## Recommended Architecture

```
┌─────────────────┐
│  Cloud Scheduler │  (Daily 9am trigger)
│  / EventBridge   │
└────────┬─────────┘
         │
         ▼
┌─────────────────┐
│  Cloud Function  │  (Your app)
│  / Lambda        │
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐ ┌──────────────┐
│ Google  │ │ WhatsApp     │
│Calendar │ │ Cloud API    │
│  API    │ │              │
└─────────┘ └──────────────┘
```

---

## Cost Estimate

### WhatsApp Cloud API
- **Free tier:** 1,000 conversations/month
- **After free tier:** ~$0.005-0.09 per conversation
- **For daily birthday messages:** Likely free (30-60 messages/month)

### Cloud Function / Lambda
- **Free tier:** 1M requests/month, 400K GB-seconds
- **After free tier:** ~$0.20/month for 1 execution/day

### **Total Estimated Cost: $0-1/month** (likely free)

---

## Next Steps

1. ✅ **Set up Meta app** and get WhatsApp Cloud API credentials
2. ✅ **Update environment variables** with new credentials
3. ✅ **Replace WhatsApp service** with Cloud API implementation
4. ✅ **Test locally** to verify it works
5. ✅ **Choose deployment platform** (recommend AWS Lambda or Google Cloud Functions)
6. ✅ **Deploy and configure scheduler** for daily 9am execution
7. ✅ **Monitor and set up alerts** for failures

---

## Migration Checklist

- [ ] Create Meta app and get credentials
- [ ] Add Cloud API credentials to `.env`
- [ ] Install `axios` dependency
- [ ] Replace `whatsapp.ts` with Cloud API implementation
- [ ] Update `config.ts` with new WhatsApp config
- [ ] Test sending messages locally
- [ ] Choose cloud deployment platform
- [ ] Set up scheduled execution (9am daily)
- [ ] Configure monitoring/alerting
- [ ] Remove `whatsapp-web.js` and `qrcode-terminal` dependencies

---

## Questions?

- **Setup help:** See `WHATSAPP_CLOUD_API_SETUP.md`
- **Example code:** See `src/services/whatsapp-cloud-api.example.ts`
- **Meta docs:** https://developers.facebook.com/docs/whatsapp/cloud-api

