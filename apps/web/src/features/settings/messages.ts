import type { ChannelType } from '@ql/contracts';

/** Plain wording for the short codes the API puts in the delivery log. Anything unknown is generic. */
const DELIVERY_ERRORS: Record<string, string> = {
  mock_delivery_failed:
    'The sample delivery service rejected this address (it refuses any address containing "fail").',
  delivery_timeout: 'The delivery service took too long to answer.',
  provider_error: 'The delivery service reported a problem.',
  delivery_failed: 'The message could not be delivered.',
  channel_disabled: 'This channel was switched off or removed before the message was sent.',
};

export const describeDeliveryError = (code: string | null): string =>
  code === null ? '' : (DELIVERY_ERRORS[code] ?? 'The message could not be delivered.');

export const CHANNEL_LABEL: Record<ChannelType, string> = {
  email: 'Email',
  sms: 'Text message (SMS)',
  webhook: 'Webhook',
};

export const TARGET_HINT: Record<ChannelType, string> = {
  email: 'An email address, like name@example.com.',
  sms: 'A mobile number with the country code, like +919876543210.',
  webhook:
    'A secure web address that starts with https://, on a public site (not localhost or an IP address).',
};

export const TARGET_ERROR: Record<ChannelType, string> = {
  email: 'Enter a valid email address, like name@example.com.',
  sms: 'Enter the number with the country code, like +919876543210.',
  webhook: 'Enter a secure web address that starts with https:// on a public site.',
};

export const POLICY_PERMISSIONS = [
  { id: 'fleet.view', label: 'See the fleet summary' },
  { id: 'alerts.view', label: 'See alerts' },
  { id: 'alerts.acknowledge', label: 'Acknowledge alerts' },
  { id: 'packs.view', label: 'See packs' },
  { id: 'channels.manage_own', label: 'Manage their own notification channels' },
  { id: 'notifications.view_log', label: 'See the delivery log' },
] as const;

export const POLICY_ROLES = [
  { id: 'fleet_manager', label: 'Fleet manager' },
  { id: 'technician', label: 'Technician' },
  { id: 'consumer_admin', label: 'Consumer admin' },
] as const;
