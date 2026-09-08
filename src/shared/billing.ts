export interface BillingRequest { requestId: string; timestamp: number }
export interface BillingCost { requestId: string; cost: number; currency: 'USD'; source: 'provider-reported'; checkedAt: number }
export interface BillingResult { success: boolean; costs: BillingCost[]; status: 'synced' | 'missing-key' | 'access-denied' | 'unavailable'; message: string }
