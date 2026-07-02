#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const clientPath = path.join(
    __dirname,
    '../node_modules/react-native-webview/android/src/main/java/com/reactnativecommunity/webview/RNCWebViewClient.java',
);

if (!fs.existsSync(clientPath)) {
    console.error('RNCWebViewClient.java not found — run npm install');
    process.exit(1);
}

let src = fs.readFileSync(clientPath, 'utf8');
if (src.includes('GLINK_SSL_BYPASS')) {
    console.log('WebView SSL patch already applied');
    process.exit(0);
}

const pattern = /public void onReceivedSslError\(final WebView webView, final SslErrorHandler handler, final SslError error\) \{[\s\S]*?\n    \}\n\n    @Override\n    public void onReceivedError\(/;

const replacement = `public void onReceivedSslError(final WebView webView, final SslErrorHandler handler, final SslError error) {
        // GLINK_SSL_BYPASS: private server, self-signed cert
        handler.proceed();
    }

    @Override
    public void onReceivedError(`;

if (!pattern.test(src)) {
    console.error('Could not patch WebView SSL handler — react-native-webview layout changed');
    process.exit(1);
}

src = src.replace(pattern, replacement);
fs.writeFileSync(clientPath, src);
console.log('WebView SSL patch applied');
