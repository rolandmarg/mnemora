# Incident: S3 Bucket Deletion Failure Blocking CloudFormation Stack Deletion

**Date:** 2025-11-20  
**Severity:** High  
**Status:** Resolved  
**Impact:** Deployment blocked, stack stuck in DELETE_FAILED state

## Summary

CloudFormation stack deletion failed because the S3 bucket (`mnemora-whatsapp-sessions-prod-845641743616`) could not be deleted. The bucket contained 8,137 object versions and 307 delete markers, preventing automatic cleanup. This blocked all subsequent deployments until manually resolved.

## Timeline

1. **Initial Failure**: Attempted to deploy with `yarn deploy:force`
2. **Stack Deletion Attempt**: CloudFormation tried to delete the stack but failed on S3 bucket deletion
3. **Stack State**: Stack entered `DELETE_FAILED` state with error: "The following resource(s) failed to delete: [SessionStorageBucket]"
4. **Resolution**: 
   - Manually deleted stack while retaining bucket resource
   - Changed bucket name in template to `-v2` suffix to avoid conflicts
   - Stack deletion completed successfully
   - Old bucket left for manual cleanup via AWS Console

## Root Cause Analysis

### Primary Cause: Excessive Object Versioning

The S3 bucket had **versioning enabled** but **no lifecycle policy** to clean up old versions. Over time, this accumulated 8,137 object versions:

1. **Versioning Enabled**: The bucket was configured with `VersioningConfiguration: Status: Enabled` (see `infrastructure/template.yaml:106-107`)

2. **Frequent Session Syncs**: WhatsApp session files are synced to S3 multiple times per Lambda execution:
   - After client initialization (`whatsapp.channel.ts:70`)
   - After successful message send (`whatsapp.channel.ts:153`)
   - Before client destruction (`whatsapp.channel.ts:330`)

3. **Multiple Session Files**: Baileys WhatsApp library creates many session files in the `auth_info/` directory:
   - `creds.json` - Main credentials
   - `app-state-sync-key-*.json` - Multiple app state sync keys
   - `pre-key-*.json` - Multiple pre-keys (typically 30+ files)
   - `session-*.json` - Session files for different contacts
   - `sender-key-*.json` - Sender keys for group chats
   - Execution tracking files (`.wwebjs_auth/alerts/`, `.wwebjs_auth/executions/`)

4. **Full Directory Sync**: The `syncToS3()` method uploads **all files** in the session directory every time, regardless of whether they changed:
   ```typescript
   // src/clients/s3.client.ts:193-221
   // Recursively uploads ALL files in directory
   // Creates new version for every file on every sync
   ```

5. **No Version Cleanup**: With versioning enabled and no lifecycle policy, every upload creates a new version. Old versions accumulate indefinitely.

### Secondary Cause: CloudFormation Deletion Limitation

S3 buckets with versioning enabled **cannot be deleted** if they contain any object versions. CloudFormation's `delete-stack` operation fails when attempting to delete such buckets:

- AWS requires all object versions and delete markers to be removed before bucket deletion
- CloudFormation does not automatically delete versions during stack deletion
- Manual intervention is required to clean up versioned buckets

### Why So Many Versions?

**Estimated calculation:**
- Lambda runs daily (cron: `0 17 * * ? *` = once per day)
- Each run syncs session files 2-3 times (init, send message, cleanup)
- Each sync uploads ~30-50 session files (pre-keys, sessions, etc.)
- Over ~30 days: 30 days × 2.5 syncs/day × 40 files = **~3,000 versions**
- Additional versions from:
  - Manual invocations
  - Failed retries
  - Execution tracking files
  - Alert state files
  - Multiple versions per file (versioning keeps all)

**Actual count: 8,137 versions** suggests the bucket has been in use for several months with frequent updates.

## Impact

1. **Deployment Blocked**: All deployments failed with `DELETE_FAILED` error
2. **Stack Stuck**: Stack could not be updated or deleted normally
3. **Manual Intervention Required**: Required AWS CLI/Console operations to resolve
4. **Storage Costs**: Accumulated versions increase S3 storage costs
5. **Deletion Complexity**: Manual bucket cleanup is time-consuming (8,000+ versions)

## Resolution

### Immediate Fix

1. **Deleted stack with resource retention**:
   ```bash
   aws cloudformation delete-stack \
     --stack-name mnemora-birthday-bot-prod \
     --region us-west-1 \
     --retain-resources SessionStorageBucket
   ```

2. **Changed bucket name** in `infrastructure/template.yaml`:
   - From: `mnemora-whatsapp-sessions-${Environment}-${AWS::AccountId}`
   - To: `mnemora-whatsapp-sessions-${Environment}-${AWS::AccountId}-v2`
   - This allows new deployment to create a fresh bucket

3. **Stack deletion completed** successfully

### Long-term Fixes Needed

1. **Add S3 Lifecycle Policy** to automatically delete old versions:
   ```yaml
   LifecycleConfiguration:
     Rules:
       - Id: DeleteOldVersions
         Status: Enabled
         NoncurrentVersionExpirationInDays: 7  # Keep versions for 7 days
   ```

2. **Optimize Session Sync** to only upload changed files:
   - Compare file checksums before uploading
   - Only sync files that have been modified
   - Reduce unnecessary version creation

3. **Consider Disabling Versioning** if not needed:
   - WhatsApp session files don't require version history
   - Versioning adds complexity and cost
   - Can use backup strategy instead if needed

4. **Add Monitoring** for bucket size and version count:
   - CloudWatch metrics for S3 bucket size
   - Alerts when version count exceeds threshold
   - Regular cleanup scripts if needed

## Prevention

1. **Always include lifecycle policies** for versioned S3 buckets
2. **Monitor S3 bucket metrics** (size, object count, version count)
3. **Optimize sync operations** to only upload changed files
4. **Consider versioning necessity** - disable if not required
5. **Test stack deletion** in dev environment before production changes
6. **Document cleanup procedures** for versioned buckets

## Files Changed

- `infrastructure/template.yaml` - Changed bucket name to `-v2` suffix (line 105)

## Related Issues

- S3 bucket versioning enabled without lifecycle policy
- Session sync uploads all files regardless of changes
- No monitoring for bucket version accumulation

## Deployment Notes

- Old bucket (`mnemora-whatsapp-sessions-prod-845641743616`) still exists with versions
- Can be manually cleaned up via AWS Console (easier than CLI for versioned buckets)
- New bucket will be created with `-v2` suffix on next deployment
- Consider adding lifecycle policy to new bucket before deployment

## Next Steps

1. ✅ Stack deletion completed
2. ⏳ Deploy with new bucket name
3. ⏳ Add lifecycle policy to new bucket configuration
4. ⏳ Optimize session sync to only upload changed files
5. ⏳ Clean up old bucket manually via AWS Console
6. ⏳ Add CloudWatch monitoring for bucket metrics

