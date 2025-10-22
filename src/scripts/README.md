# Dawn Sign Press Backend Scripts

<div align="center">

![Dawn Sign Press Logo](https://dawnsignpress.com/wp-content/uploads/2022/05/DSP_logo_2022_color.png)

*Utility scripts for managing the Dawn Sign Press backend services*

</div>

## 📋 Contents

- [Subscription Management](#subscription-management)
  - [List Subscription Plans](#list-subscription-plans)
  - [Deactivate Subscription Plan](#deactivate-subscription-plan)

## 🔄 Subscription Management

### List Subscription Plans

**Purpose:** Lists all subscription plans and variations in Square's catalog.

```bash
npm run list-subscription-plans
```

**Output Details:**

This will display all subscription plans and their variations with details including:

| Information | Description |
|-------------|-------------|
| Catalog Item ID | Unique identifier for the plan or variation |
| Name | Display name of the plan |
| Type | Either `SUBSCRIPTION_PLAN` or `SUBSCRIPTION_PLAN_VARIATION` |
| Status | Whether active or already deactivated |
| Pricing | Cost information in the configured currency |
| Cadence | Billing frequency (monthly, annual, etc.) |

> **Tip:** Use this script to find the catalog item IDs needed for deactivation.

### Deactivate Subscription Plan

**Purpose:** Deactivates a subscription plan or variation in Square's catalog by marking it as unavailable.

```bash
npm run cancel-subscription <CATALOG_ITEM_ID>
```

Where `<CATALOG_ITEM_ID>` is the ID of the subscription plan or variation to deactivate.

#### ⚠️ Important Notes

- This script does not delete the subscription plan or variation (Square API doesn't allow this).
- Instead, it marks the item as unavailable by:
  - Setting `present_at_all_locations: false`
  - Prefixing the name with `[DEACTIVATED]`
- When deactivating a parent subscription plan, all its variations must be deactivated first.
  - The script will automatically detect and deactivate all variations before the parent plan.
- This operation cannot be undone through the script. To reactivate, you would need to use Square Dashboard or create a separate reactivation script.

#### Example

```bash
npm run cancel-subscription GM4O5BI76TMMOF2Z3SV6Z4ZB
```

This will deactivate the subscription plan with ID `GM4O5BI76TMMOF2Z3SV6Z4ZB` and all its variations.

#### How It Works

1. The script first checks if the provided ID is a parent plan or variation
2. If it's a parent plan with variations, it deactivates all variations first
3. It then deactivates the target item by:
   - Setting `present_at_all_locations: false` (making it unavailable)
   - Prefixing the name with `[DEACTIVATED]`
4. The script provides detailed console output of the process
