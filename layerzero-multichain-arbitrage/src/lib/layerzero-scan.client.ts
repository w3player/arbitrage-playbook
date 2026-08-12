export interface LayerZeroScanMessage {
  guid: string | null;
  created: string | null;
  sourceEndpointId: number;
  destinationEndpointId: number;
  senderAddress: string;
  receiverAddress: string;
  sourceTransactionHash: string | null;
  sourcePayload: string | null;
}

export interface LayerZeroScanPage {
  messages: LayerZeroScanMessage[];
  nextToken: string | null;
}

export interface LayerZeroScanPageRequest {
  endpointIds: readonly number[];
  start: string;
  end: string;
  limit: number;
  nextToken?: string;
}

interface LayerZeroScanApiMessage {
  guid?: unknown;
  created?: unknown;
  pathway?: {
    srcEid?: unknown;
    dstEid?: unknown;
    sender?: { address?: unknown };
    receiver?: { address?: unknown };
  };
  source?: { tx?: { txHash?: unknown; payload?: unknown } };
}

interface LayerZeroScanApiResponse {
  data?: unknown;
  nextToken?: unknown;
}

export class LayerZeroScanClient {
  constructor(private readonly apiUrl: string) {}

  async fetchMessagesPage(
    request: LayerZeroScanPageRequest,
  ): Promise<LayerZeroScanPage> {
    const url = new URL(`${this.apiUrl}/messages/latest`);
    const endpointIds = request.endpointIds.join(',');
    url.searchParams.set('limit', String(request.limit));
    url.searchParams.set('start', request.start);
    url.searchParams.set('end', request.end);
    url.searchParams.set('srcChainIds', endpointIds);
    url.searchParams.set('dstChainIds', endpointIds);
    if (request.nextToken) {
      url.searchParams.set('nextToken', request.nextToken);
    }

    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`LayerZero Scan request failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as LayerZeroScanApiResponse;
    if (!Array.isArray(payload.data)) {
      throw new Error('LayerZero Scan response data must be an array');
    }

    return {
      messages: payload.data
        .map((message) => this.parseMessage(message))
        .filter((message): message is LayerZeroScanMessage => !!message),
      nextToken:
        typeof payload.nextToken === 'string' && payload.nextToken.length > 0
          ? payload.nextToken
          : null,
    };
  }

  messageUrl(message: LayerZeroScanMessage): string {
    return message.sourceTransactionHash
      ? `https://layerzeroscan.com/tx/${message.sourceTransactionHash}`
      : 'https://layerzeroscan.com';
  }

  private parseMessage(value: unknown): LayerZeroScanMessage | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const message = value as LayerZeroScanApiMessage;
    const sourceEndpointId = message.pathway?.srcEid;
    const destinationEndpointId = message.pathway?.dstEid;
    const senderAddress = message.pathway?.sender?.address;
    const receiverAddress = message.pathway?.receiver?.address;
    if (
      typeof sourceEndpointId !== 'number' ||
      typeof destinationEndpointId !== 'number' ||
      typeof senderAddress !== 'string' ||
      typeof receiverAddress !== 'string'
    ) {
      return null;
    }

    return {
      guid: typeof message.guid === 'string' ? message.guid : null,
      created: typeof message.created === 'string' ? message.created : null,
      sourceEndpointId,
      destinationEndpointId,
      senderAddress,
      receiverAddress,
      sourceTransactionHash:
        typeof message.source?.tx?.txHash === 'string'
          ? message.source.tx.txHash
          : null,
      sourcePayload:
        typeof message.source?.tx?.payload === 'string'
          ? message.source.tx.payload
          : null,
    };
  }
}
