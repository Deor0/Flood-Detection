export interface InboundSms {
  from: string;
  body: string;
  receivedAt: Date;
}

export interface OutboundSms {
  to: string;
  body: string;
}

/** Provider-agnostic SMS interface. Twilio/Textbelt are thin adapters. */
export interface SmsProvider {
  readonly name: 'twilio' | 'textbelt';
  send(message: OutboundSms): Promise<void>;
}
