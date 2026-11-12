export interface PayPalMoney {
  currency_code: string;
  value: string;
}

export interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

export interface PayPalAuthorizationResource {
  id: string;
  status: "CREATED" | "CAPTURED" | "DENIED" | "PARTIALLY_CAPTURED" | "VOIDED" | "PENDING" | "EXPIRED";
  status_details?: { reason?: string };
  amount: PayPalMoney;
  invoice_id?: string;
  custom_id?: string;
  seller_protection?: { status?: string };
  expiration_time?: string;
  create_time?: string;
  update_time?: string;
  links?: PayPalLink[];
}

export interface PayPalCaptureResource {
  id: string;
  status: "COMPLETED" | "DECLINED" | "PARTIALLY_REFUNDED" | "PENDING" | "REFUNDED" | "FAILED";
  status_details?: { reason?: string };
  amount: PayPalMoney;
  final_capture?: boolean;
  invoice_id?: string;
  custom_id?: string;
  seller_receivable_breakdown?: {
    gross_amount?: PayPalMoney;
    paypal_fee?: PayPalMoney;
    net_amount?: PayPalMoney;
  };
  create_time?: string;
  update_time?: string;
  links?: PayPalLink[];
}

export interface PayPalPurchaseUnit {
  reference_id?: string;
  custom_id?: string;
  description?: string;
  amount: PayPalMoney;
  payee?: { email_address?: string; merchant_id?: string };
  payments?: {
    authorizations?: PayPalAuthorizationResource[];
    captures?: PayPalCaptureResource[];
  };
}

export interface PayPalOrderResource {
  id: string;
  intent: "AUTHORIZE" | "CAPTURE";
  status: "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
  purchase_units: PayPalPurchaseUnit[];
  payer?: { payer_id?: string; email_address?: string; name?: { given_name?: string; surname?: string } };
  payment_source?: { paypal?: { email_address?: string; account_id?: string } };
  create_time?: string;
  update_time?: string;
  links?: PayPalLink[];
}

export interface PayPalErrorDetail {
  issue?: string;
  description?: string;
  field?: string;
}

export interface PayPalErrorBody {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: PayPalErrorDetail[];
}

export interface PayPalWebhookEvent {
  id: string;
  event_version?: string;
  create_time?: string;
  resource_type?: string;
  resource_version?: string;
  event_type: string;
  summary?: string;
  resource: Record<string, unknown> & { id?: string; status?: string };
  links?: PayPalLink[];
}
