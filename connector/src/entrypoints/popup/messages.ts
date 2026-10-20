/** Popup ↔ Connector background. Internal to the Connector. */

import type { ConnectorTarget } from '../../../../src/shared/web-agent/connector-protocol';

export type PopupRequest =
  | { op: 'state' }
  | { op: 'disconnect-all' }
  | { op: 'set-paused'; paused: boolean };

export interface PopupState {
  /** Better Sidebar answered the ping. */
  mainInstalled: boolean;
  paused: boolean;
  /** Tabs the Connector is attached to right now. */
  tabs: ConnectorTarget[];
}
