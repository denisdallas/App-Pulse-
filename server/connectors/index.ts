import { MarketplaceConnector } from './types.ts';
import { SteamConnector } from './steam.ts';
import { GooglePlayConnector } from './googleplay.ts';
import { MicrosoftStoreConnector } from './microsoft.ts';
import { Marketplace } from '../../src/types.ts';

export class ConnectorRegistry {
  private connectors: Map<Marketplace, MarketplaceConnector> = new Map();

  constructor() {
    this.register(new SteamConnector());
    this.register(new GooglePlayConnector());
    this.register(new MicrosoftStoreConnector());
  }

  register(connector: MarketplaceConnector) {
    this.connectors.set(connector.marketplace, connector);
  }

  get(marketplace: Marketplace): MarketplaceConnector | undefined {
    return this.connectors.get(marketplace);
  }

  getAll(): MarketplaceConnector[] {
    return Array.from(this.connectors.values());
  }

  async getAllStatuses() {
    const statuses: Record<string, any> = {};
    for (const [key, connector] of this.connectors.entries()) {
      statuses[key] = await connector.getStatus();
    }
    return statuses;
  }
}

export const connectorRegistry = new ConnectorRegistry();
