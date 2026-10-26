export class AppMetadataService {
  constructor(version) {
    this.version = String(version || '').trim() || '0.0.0';
  }

  get versionLabel() {
    return `v${this.version}`;
  }
}

export const appMetadata = new AppMetadataService(__APP_VERSION__);
