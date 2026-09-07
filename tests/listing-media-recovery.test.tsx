// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ListingMediaUploader } from '../components/listing-media-uploader';
import { writeStoredAuthSession } from '../lib/auth-session';
import * as mediaApi from '../lib/listing-media';

vi.mock('../lib/listing-media', async (original) => ({
  ...await original<typeof import('../lib/listing-media')>(),
  getOwnedListingMedia: vi.fn(), initializeListingMedia: vi.fn(),
  putPresignedFile: vi.fn(), finalizeListingMedia: vi.fn(),
  retryListingMedia: vi.fn(), removeListingMedia: vi.fn()
}));
afterEach(() => { cleanup(); localStorage.clear(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
const media = { id: 'remote', uploadAttemptId: 'a'.repeat(64), kind: 'bedroom', sortOrder: 0, mimeType: 'image/png' as const, sizeBytes: 3, checksum: 'a'.repeat(64), storageStatus: 'PENDING_UPLOAD' as const, reviewStatus: 'PENDING' as const, uploadExpiresAt: null, finalizedAt: null, publishedAt: null };
const target = { media, uploadAttemptId: 'a'.repeat(64), uploadUrl: 'https://objects.test/new', expiresAt: '2099-01-01' };
async function mount() {
  writeStoredAuthSession('token');
  vi.mocked(mediaApi.getOwnedListingMedia).mockResolvedValue([]);
  vi.mocked(mediaApi.initializeListingMedia).mockResolvedValue(target);
  vi.mocked(mediaApi.finalizeListingMedia).mockResolvedValue({ ...media, storageStatus: 'READY' });
  render(<ListingMediaUploader listingId='listing' token='token' disabled={false} onSummaryChange={() => {}} />);
  await waitFor(() => expect(mediaApi.getOwnedListingMedia).toHaveBeenCalled());
}
function selectFile() {
  fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [new File(['png'], 'room.png', { type: 'image/png' })] } });
}
it('retries initialization after a transient failure before any remote media exists', async () => {
  await mount();
  vi.mocked(mediaApi.initializeListingMedia).mockRejectedValueOnce(new Error('temporary failure'));
  selectFile();
  fireEvent.click(await screen.findByRole('button', { name: '重试' }));
  await screen.findByText('已保存');
  expect(mediaApi.initializeListingMedia).toHaveBeenCalledTimes(2);
  expect(mediaApi.retryListingMedia).not.toHaveBeenCalled();
});
it('removes a failed local selection without requesting deletion of a nonexistent remote ID', async () => {
  await mount();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(mediaApi.initializeListingMedia).mockRejectedValueOnce(new Error('temporary failure'));
  vi.mocked(mediaApi.removeListingMedia).mockRejectedValue(new Error('not found'));
  selectFile();
  await screen.findByRole('button', { name: '重试' });
  fireEvent.click(screen.getByRole('button', { name: '删除' }));
  await screen.findByText('尚未添加图片。');
  expect(mediaApi.removeListingMedia).not.toHaveBeenCalled();
});
it('recovers a READY media after the finalize response is lost instead of retrying validation', async () => {
  await mount();
  vi.mocked(mediaApi.finalizeListingMedia).mockRejectedValueOnce(new Error('lost response'));
  selectFile();
  await screen.findByRole('button', { name: '重试' });
  vi.mocked(mediaApi.getOwnedListingMedia).mockResolvedValue([{ ...media, storageStatus: 'READY' }]);
  vi.mocked(mediaApi.retryListingMedia).mockRejectedValue(new Error('state conflict'));
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  await screen.findByText('已保存');
  expect(mediaApi.retryListingMedia).not.toHaveBeenCalled();
  expect(mediaApi.putPresignedFile).toHaveBeenCalledTimes(1);
});
it('keeps recovery available across repeated PUT failures and eventually finalizes the fresh upload', async () => {
  await mount();
  vi.mocked(mediaApi.putPresignedFile)
    .mockRejectedValueOnce(new Error('first PUT failed'))
    .mockRejectedValueOnce(new Error('retry PUT failed'))
    .mockResolvedValue(undefined);
  vi.mocked(mediaApi.retryListingMedia).mockResolvedValue(target);
  selectFile();
  await screen.findByRole('button', { name: '重试' });
  vi.mocked(mediaApi.getOwnedListingMedia).mockResolvedValue([media]);
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  await waitFor(() => expect(mediaApi.putPresignedFile).toHaveBeenCalledTimes(2));
  await waitFor(() => expect((screen.getByRole('button', { name: '重试' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  await screen.findByText('已保存');
  expect(mediaApi.retryListingMedia).toHaveBeenCalledTimes(2);
  expect(mediaApi.finalizeListingMedia).toHaveBeenCalledTimes(1);
});

it('stops after initialization resolves if the account changed while it was pending', async () => {
  await mount();
  let resolve!: (value: typeof target) => void;
  vi.mocked(mediaApi.initializeListingMedia).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  selectFile();
  await waitFor(() => expect(mediaApi.initializeListingMedia).toHaveBeenCalledTimes(1));
  writeStoredAuthSession('different-account');
  resolve(target);
  await waitFor(() => expect((document.querySelector('input[type=file]') as HTMLInputElement).disabled).toBe(false));
  expect(mediaApi.putPresignedFile).not.toHaveBeenCalled();
  expect(mediaApi.finalizeListingMedia).not.toHaveBeenCalled();
});
it('does not rotate another upload when the account changes during retry reconciliation', async () => {
  await mount();
  vi.mocked(mediaApi.putPresignedFile).mockRejectedValueOnce(new Error('interrupted'));
  selectFile();
  await screen.findByRole('button', { name: '重试' });
  let resolve!: (value: typeof media[]) => void;
  vi.mocked(mediaApi.getOwnedListingMedia).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  await waitFor(() => expect(mediaApi.getOwnedListingMedia).toHaveBeenCalledTimes(2));
  writeStoredAuthSession('different-account');
  resolve([media]);
  await waitFor(() => expect((screen.getByRole('button', { name: '重试' }) as HTMLButtonElement).disabled).toBe(false));
  expect(mediaApi.retryListingMedia).not.toHaveBeenCalled();
});
it('does not initialize as the previous account after asynchronous hashing finishes', async () => {
  writeStoredAuthSession('token');
  const actual = await vi.importActual<typeof import('../lib/listing-media')>('../lib/listing-media');
  let resolve!: (bytes: ArrayBuffer) => void;
  const file = { type: 'image/png', size: 3, arrayBuffer: () => new Promise<ArrayBuffer>(done => { resolve = done; }) } as File;
  vi.stubGlobal('crypto', { subtle: { digest: async () => new ArrayBuffer(32) } });
  const fetchMock = vi.fn().mockResolvedValue(Response.json(target));
  vi.stubGlobal('fetch', fetchMock);
  const pending = actual.initializeListingMedia('token', 'listing', file, 'bedroom', 'fa4750e3-b777-44d6-8c5b-6933672f0051').catch(() => undefined);
  writeStoredAuthSession('different-account');
  resolve(new ArrayBuffer(3));
  await pending;
  expect(fetchMock).not.toHaveBeenCalled();
});

it('recovers a lost retry response using the freshly observed attempt identity', async () => {
  await mount();
  vi.mocked(mediaApi.putPresignedFile).mockRejectedValueOnce(new Error('interrupted'));
  selectFile();
  await screen.findByRole('button', { name: '重试' });
  const rotated = { ...media, uploadAttemptId: 'b'.repeat(64) };
  vi.mocked(mediaApi.getOwnedListingMedia).mockResolvedValueOnce([media]).mockResolvedValue([rotated]);
  vi.mocked(mediaApi.retryListingMedia).mockRejectedValueOnce(new Error('retry response lost')).mockResolvedValue({ ...target, media: { ...media, uploadAttemptId: 'c'.repeat(64) }, uploadAttemptId: 'c'.repeat(64) });
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  await waitFor(() => expect(mediaApi.retryListingMedia).toHaveBeenCalledTimes(1));
  await waitFor(() => expect((screen.getByRole('button', { name: '重试' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  await screen.findByText('已保存');
  expect(mediaApi.retryListingMedia).toHaveBeenLastCalledWith('token', 'listing', 'remote', rotated.uploadAttemptId);
  expect(mediaApi.finalizeListingMedia).toHaveBeenLastCalledWith('token', 'listing', 'remote', 'c'.repeat(64));
});
it('does not finalize as the previous account after an already-started PUT finishes', async () => {
  await mount();
  let resolve!: () => void;
  vi.mocked(mediaApi.putPresignedFile).mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
  selectFile();
  await waitFor(() => expect(mediaApi.putPresignedFile).toHaveBeenCalledTimes(1));
  writeStoredAuthSession('different-account');
  resolve();
  await waitFor(() => expect((document.querySelector('input[type=file]') as HTMLInputElement).disabled).toBe(false));
  expect(mediaApi.finalizeListingMedia).not.toHaveBeenCalled();
});
it('retains one initialization command per file after a lost POST response, with distinct identities within a batch', async () => {
  await mount();
  vi.mocked(mediaApi.initializeListingMedia).mockRejectedValueOnce(new Error('response lost'));
  selectFile();
  await screen.findByRole('button', { name: '重试' });
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  await screen.findByText('已保存');
  const calls = vi.mocked(mediaApi.initializeListingMedia).mock.calls;
  expect(calls[0]![4]).toMatch(/^[a-f0-9-]{36}$/);
  expect(calls[1]![4]).toBe(calls[0]![4]);
  selectFile();
  await waitFor(() => expect(mediaApi.initializeListingMedia).toHaveBeenCalledTimes(3));
  expect(calls[2]![4]).not.toBe(calls[0]![4]);
});

it('discards the remotely committed row when removing a local selection whose initialize response was lost', async () => {
  await mount();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(mediaApi.initializeListingMedia).mockImplementationOnce(async (_token, _listing, _file, _kind, commandId) => {
    vi.mocked(mediaApi.getOwnedListingMedia).mockResolvedValue([{ ...media, initializationCommandId: commandId }]);
    throw new Error('response lost after commit');
  });
  selectFile();
  await screen.findByRole('button', { name: '重试' });
  fireEvent.click(screen.getByRole('button', { name: '删除' }));
  await screen.findByText('尚未添加图片。');
  expect(mediaApi.removeListingMedia).toHaveBeenCalledWith('token', 'listing', 'remote');
});
it('recovers already-ready initialization metadata without another PUT', async () => {
  await mount();
  vi.mocked(mediaApi.initializeListingMedia).mockResolvedValue({ ...target, media: { ...media, storageStatus: 'READY' }, uploadUrl: null, expiresAt: null });
  selectFile();
  await screen.findByText('已保存');
  expect(mediaApi.putPresignedFile).not.toHaveBeenCalled();
  expect(mediaApi.finalizeListingMedia).not.toHaveBeenCalled();
});
