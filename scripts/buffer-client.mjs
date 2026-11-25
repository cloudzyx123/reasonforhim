export const BUFFER_ENDPOINT = 'https://api.buffer.com';
const POST_FIELDS = 'id status channelId dueAt sentAt';
const PERMANENT_CODES = new Set(['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'GRAPHQL_VALIDATION_FAILED', 'BAD_USER_INPUT']);
const PRECONNECT_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT']);

export class BufferApiError extends Error {
  constructor(code, disposition, retryAfterMs = 0) {
    super(`Buffer ${code}`);
    this.code = code;
    this.disposition = disposition;
    this.retryAfterMs = retryAfterMs;
  }
}

function retryAfterMs(response, now) {
  const header = response.headers.get('retry-after')?.trim() ?? '';
  if (/^\d+$/.test(header)) return Math.min(Number(header), 31 * 86_400) * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now()) : 60_000;
}

export function createBufferClient({ apiKey, fetchImpl = fetch, now = Date.now } = {}) {
  if (!apiKey) throw new Error('缺少 GitHub Secret BUFFER_API_KEY');
  return async function request(query, variables = {}) {
    let response;
    try {
      response = await fetchImpl(BUFFER_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query, variables }),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      const rejectedBeforeConnect = PRECONNECT_CODES.has(error.cause?.code);
      throw new BufferApiError(rejectedBeforeConnect ? 'CONNECTION_UNAVAILABLE' : 'TRANSPORT_UNCERTAIN',
        rejectedBeforeConnect ? 'pending' : 'unknown');
    }

    if (response.status === 429) throw new BufferApiError('RATE_LIMIT_EXCEEDED', 'pending', retryAfterMs(response, now));
    if ([400, 401, 403, 404].includes(response.status)) {
      throw new BufferApiError(`HTTP_${response.status}`, 'failed');
    }
    if (!response.ok) throw new BufferApiError(`HTTP_${response.status}`, 'unknown');
    const body = await response.json().catch(() => null);
    const codes = body?.errors?.map(item => item.extensions?.code) ?? [];
    // If a mutation returned data and errors together, its side effects are uncertain.
    if (codes.length && !body?.data) {
      if (codes.every(code => code === 'RATE_LIMIT_EXCEEDED')) {
        throw new BufferApiError('RATE_LIMIT_EXCEEDED', 'pending', retryAfterMs(response, now));
      }
      if (codes.every(code => PERMANENT_CODES.has(code))) throw new BufferApiError(codes[0], 'failed');
    }
    if (codes.length || !body?.data) throw new BufferApiError('RESPONSE_UNCERTAIN', 'unknown');
    return body.data;
  };
}

export async function resolveOrganizationId(request, configured) {
  if (configured) return configured;
  const { account } = await request('query Organizations { account { organizations { id name } } }');
  const organizations = account?.organizations ?? [];
  if (organizations.length === 1) return organizations[0].id;
  throw new Error('Buffer 需要明确的组织 ID；请在账户设置中查询并设置 BUFFER_ORGANIZATION_ID');
}

export async function fetchChannels(request, organizationId) {
  const { channels } = await request(`query Channels($input: ChannelsInput!) {
    channels(input: $input) { id name displayName service isDisconnected isLocked isQueuePaused }
  }`, { input: { organizationId } });
  if (!Array.isArray(channels)) throw new BufferApiError('CHANNELS_RESPONSE_UNCERTAIN', 'unknown');
  return channels;
}

export const supportedService = service => service === 'twitter' || service === 'facebook';

export function buildCreatePostInput({ channel, text, article, mode }) {
  const input = {
    channelId: channel.id, text, schedulingType: 'automatic', mode,
    assets: [], needsApproval: false, saveToDraft: false,
  };
  if (channel.service === 'facebook') {
    input.metadata = { facebook: { type: 'post', linkAttachment: { url: article.url } } };
  }
  return input;
}

export async function createPost(request, input) {
  const { createPost: result } = await request(`mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess { post { ${POST_FIELDS} } }
      ... on MutationError { message }
    }
  }`, { input });

  if (result?.__typename === 'PostActionSuccess' && result.post?.id && result.post.channelId === input.channelId) {
    return result.post;
  }
  if (result?.__typename === 'LimitReachedError') throw new BufferApiError('LimitReachedError', 'pending');
  if (['InvalidInputError', 'UnauthorizedError', 'NotFoundError'].includes(result?.__typename)) {
    throw new BufferApiError(result.__typename, 'failed');
  }
  throw new BufferApiError('MUTATION_RESULT_UNCERTAIN', 'unknown');
}

export async function fetchPost(request, id) {
  const { post } = await request(`query DistributionPost($input: PostInput!) {
    post(input: $input) { ${POST_FIELDS} }
  }`, { input: { id } });
  if (post?.id !== id) throw new BufferApiError('POST_RESPONSE_UNCERTAIN', 'unknown');
  return post;
}
