"use strict";
async function handleInstalled() {
  await browser.tabs.create({ url: "/about.html" });
}

browser.runtime.onInstalled.addListener(handleInstalled);
