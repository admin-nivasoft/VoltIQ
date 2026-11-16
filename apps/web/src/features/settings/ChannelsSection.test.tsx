import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callsOf, makeMe, renderWithProviders, stubApi } from '../../test/utils';
import { ChannelsSection } from './ChannelsSection';

afterEach(() => vi.unstubAllGlobals());

const saved = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'email',
    target: 'priya@example.test',
    enabled: true,
  },
];
const base = { 'GET /notification-channels': { body: saved } };
const field = (name: RegExp | string) => screen.getByLabelText(name);

describe('ChannelsSection', () => {
  it('shows a labelled box for each kind, filled from what is saved, with a hint for each', async () => {
    stubApi(base);
    renderWithProviders(<ChannelsSection />, { me: makeMe('technician') });
    expect(await screen.findByLabelText('Email address')).toHaveValue('priya@example.test');
    expect(field('Mobile number')).toHaveValue('');
    expect(field('Webhook address')).toHaveValue('');
    expect(field('Email address')).toHaveAccessibleDescription(
      /email address, like name@example.com/i,
    );
    expect(screen.getAllByRole('group').map((g) => g.textContent?.slice(0, 5))).toHaveLength(3);
  });

  it.each([
    ['Email address', 'not-an-email', /valid email address/i],
    ['Mobile number', '98000', /country code/i],
    ['Webhook address', 'http://example.test/x', /https/i],
    ['Webhook address', 'https://localhost/x', /public site/i],
    ['Webhook address', 'https://10.0.0.1/x', /public site/i],
  ])(
    '%s %j is refused with a plain message, nothing is sent, and focus goes to the box',
    async (label, value, message) => {
      const spy = stubApi({ ...base, 'PUT /notification-channels': { body: [] } });
      renderWithProviders(<ChannelsSection />, { me: makeMe('technician') });
      const input = await screen.findByLabelText(label);
      await userEvent.clear(input);
      await userEvent.type(input, value);
      await userEvent.click(screen.getByRole('button', { name: 'Save channels' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/1 problem to fix/i);
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAccessibleDescription(message);
      expect(input).toHaveFocus();
      expect(callsOf(spy).some(([, i]) => i.method === 'PUT')).toBe(false);
    },
  );

  it('saves only the filled boxes, trimmed, with their on/off setting, and announces it', async () => {
    const spy = stubApi({
      ...base,
      'PUT /notification-channels': {
        body: [
          ...saved,
          {
            id: '22222222-2222-4222-8222-222222222222',
            type: 'sms',
            target: '+919800000001',
            enabled: false,
          },
        ],
      },
    });
    renderWithProviders(<ChannelsSection />, { me: makeMe('technician') });
    await userEvent.type(await screen.findByLabelText('Mobile number'), '  +919800000001  ');
    await userEvent.click(screen.getAllByRole('checkbox')[1]!); // switch the SMS channel off
    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save channels' }));
    await waitFor(() => expect(callsOf(spy).some(([, i]) => i.method === 'PUT')).toBe(true));
    const put = callsOf(spy).find(([, i]) => i.method === 'PUT')!;
    expect(put[0]).toBe('/api/v1/notification-channels');
    expect(JSON.parse(String(put[1].body))).toEqual({
      channels: [
        { type: 'email', target: 'priya@example.test', enabled: true },
        { type: 'sms', target: '+919800000001', enabled: false },
      ],
    });
    expect(await screen.findByText(/Channels saved/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('You have unsaved changes.')).not.toBeInTheDocument(),
    );
  });

  it('clearing a box removes that channel', async () => {
    const spy = stubApi({ ...base, 'PUT /notification-channels': { body: [] } });
    renderWithProviders(<ChannelsSection />, { me: makeMe('technician') });
    await userEvent.clear(await screen.findByLabelText('Email address'));
    await userEvent.click(screen.getByRole('button', { name: 'Save channels' }));
    await waitFor(() => expect(callsOf(spy).some(([, i]) => i.method === 'PUT')).toBe(true));
    expect(JSON.parse(String(callsOf(spy).find(([, i]) => i.method === 'PUT')![1].body))).toEqual({
      channels: [],
    });
  });

  it('shows a server refusal in plain words and keeps what you typed', async () => {
    stubApi({
      ...base,
      'PUT /notification-channels': {
        status: 500,
        body: { error: { code: 'internal', message: 'x' } },
      },
    });
    renderWithProviders(<ChannelsSection />, { me: makeMe('technician') });
    const input = await screen.findByLabelText('Mobile number');
    await userEvent.type(input, '+919800000001');
    await userEvent.click(screen.getByRole('button', { name: 'Save channels' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t save your channels/i);
    expect(input).toHaveValue('+919800000001');
  });

  it('the test button explains why it is off: nothing entered, or unsaved changes', async () => {
    stubApi(base);
    renderWithProviders(<ChannelsSection />, { me: makeMe('technician') });
    const buttons = await screen.findAllByRole('button', { name: /Send test message/ });
    expect(buttons[0]).toHaveAttribute('aria-disabled', 'false'); // email is saved and unchanged
    expect(buttons[1]).toHaveAttribute('aria-disabled', 'true');
    expect(buttons[1]).toHaveAccessibleDescription('Enter an address first.');
    await userEvent.type(screen.getByLabelText('Email address'), 'x');
    expect(buttons[0]).toHaveAttribute('aria-disabled', 'true');
    expect(buttons[0]).toHaveAccessibleDescription('Save your changes first.');
  });

  it('sends a test and shows that it worked, with an icon and words', async () => {
    const spy = stubApi({
      ...base,
      'POST /notification-channels/test': {
        body: { channel: 'email', status: 'sent', error: null, at: new Date().toISOString() },
      },
    });
    renderWithProviders(<ChannelsSection />, { me: makeMe('technician') });
    await userEvent.click(
      (await screen.findAllByRole('button', { name: /Send test message/ }))[0]!,
    );
    expect(await screen.findByText('Test message sent to Email.')).toBeInTheDocument();
    const post = callsOf(spy).find(([, i]) => i.method === 'POST')!;
    expect(JSON.parse(String(post[1].body))).toEqual({ type: 'email' });
  });

  it('shows a failed test as a failure, in plain words, with the reason', async () => {
    stubApi({
      'GET /notification-channels': { body: [{ ...saved[0], target: 'fail@example.test' }] },
      'POST /notification-channels/test': {
        body: {
          channel: 'email',
          status: 'failed',
          error: 'mock_delivery_failed',
          at: new Date().toISOString(),
        },
      },
    });
    renderWithProviders(<ChannelsSection />, { me: makeMe('technician') });
    await userEvent.click(
      (await screen.findAllByRole('button', { name: /Send test message/ }))[0]!,
    );
    const text = await screen.findByText(/Test message to Email failed/);
    expect(text).toHaveTextContent(/rejected this address/i);
    expect(text).not.toHaveTextContent(/mock_delivery_failed/);
  });

  it('says to save first when the server has no such channel, and explains a rate limit', async () => {
    let n = 0;
    stubApi({
      ...base,
      'POST /notification-channels/test': () =>
        ++n === 1
          ? { status: 404, body: { error: { code: 'not_found', message: 'x' } } }
          : { status: 429, body: { error: { code: 'rate_limited', message: 'x' } } },
    });
    renderWithProviders(<ChannelsSection />, { me: makeMe('technician') });
    const button = (await screen.findAllByRole('button', { name: /Send test message/ }))[0]!;
    await userEvent.click(button);
    expect(await screen.findByText(/Save this channel first/)).toBeInTheDocument();
    await userEvent.click(button);
    expect(await screen.findByText(/too many requests/i)).toBeInTheDocument();
  });

  it('has loading and error states with a working retry', async () => {
    let n = 0;
    stubApi({
      'GET /notification-channels': () =>
        ++n === 1
          ? { status: 500, body: { error: { code: 'internal', message: 'x' } } }
          : { body: [] },
    });
    renderWithProviders(<ChannelsSection />, { me: makeMe('technician') });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByLabelText('Email address')).toHaveValue('');
  });
});
