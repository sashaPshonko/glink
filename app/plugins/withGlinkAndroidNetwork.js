const { withAndroidManifest, withDangerousMod, AndroidConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const GLINK_HOST = '31.128.38.147';

function patchWebViewSsl(projectRoot) {
    const clientPath = path.join(
        projectRoot,
        'node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java',
    );
    if (!fs.existsSync(clientPath)) return;
    let src = fs.readFileSync(clientPath, 'utf8');
    if (src.includes(`failingUrl.contains("${GLINK_HOST}")`)) return;
    const needle = `        handler.cancel();

        if (!topWindowUrl.equalsIgnoreCase(failingUrl)) {`;
    const replacement = `        if (failingUrl != null && failingUrl.contains("${GLINK_HOST}")) {
            handler.proceed();
            return;
        }
        handler.cancel();

        if (!topWindowUrl.equalsIgnoreCase(failingUrl)) {`;
    if (!src.includes(needle)) return;
    src = src.replace(needle, replacement);
    fs.writeFileSync(clientPath, src);
}

function withGlinkAndroidNetwork(config) {
    config = withDangerousMod(config, [
        'android',
        async (cfg) => {
            const projectRoot = cfg.modRequest.projectRoot;
            patchWebViewSsl(projectRoot);
            const resXml = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
            const resRaw = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/raw');
            fs.mkdirSync(resXml, { recursive: true });
            fs.mkdirSync(resRaw, { recursive: true });

            const certSrc = path.join(projectRoot, 'glink-cert.pem');
            let domainTrust = `
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>`;
            if (fs.existsSync(certSrc)) {
                fs.copyFileSync(certSrc, path.join(resRaw, 'glink_cert.pem'));
                domainTrust = `
    <trust-anchors>
      <certificates src="@raw/glink_cert" />
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>`;
            }

            fs.writeFileSync(
                path.join(resXml, 'network_security_config.xml'),
                `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">${GLINK_HOST}</domain>
    <domain includeSubdomains="true">localhost</domain>
    <domain includeSubdomains="true">10.0.2.2</domain>
    ${domainTrust}
  </domain-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
      <certificates src="user" />
    </trust-anchors>
  </base-config>
</network-security-config>`,
            );
            return cfg;
        },
    ]);

    config = withAndroidManifest(config, (cfg) => {
        const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
        app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
        app.$['android:usesCleartextTraffic'] = 'true';
        return cfg;
    });

    return config;
}

module.exports = withGlinkAndroidNetwork;
