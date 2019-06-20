/* global TAG_WHITELIST */
"use strict";

if (window.CONTENT_SCRIPT_LOADED === undefined) {
  window.CONTENT_SCRIPT_LOADED = true;

  async function clipPage({ elementId, imageUrls }) {
    const contentElement = document.getElementById(elementId);
    if (contentElement === null) {
      browser.runtime.sendMessage({ error: `ID '${elementId}' not found` });
      return;
    }

    const { title } = document;
    const images = new Map(imageUrls.map(x => [x, null]));
    const content = await extractNode(contentElement, images);
    browser.runtime.sendMessage({
      chapter: { title, src: document.URL, content },
      images
    });
  }

  function getImgBlob(node) {
    return new Promise(resolve => {
      const canvas = document.createElement("canvas");
      canvas.width = node.naturalWidth;
      canvas.height = node.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(node, 0, 0);
      canvas.toBlob(resolve);
    });
  }

  async function extractNode(node, images) {
    if (node.nodeType == Node.TEXT_NODE) {
      return node.nodeValue;
    }

    if (node.nodeType != Node.ELEMENT_NODE) {
      return null;
    }

    if (!TAG_WHITELIST.includes(node.tagName)) {
      return null;
    }

    if (window.getComputedStyle(node).display === "none") {
      return null;
    }

    if (node.tagName == "IMG") {
      const { src } = node;
      if (!images.has(src)) {
        images.set(src, await getImgBlob(node));
      }
      return { tagName: "IMG", src };
    }

    const result = { tagName: node.tagName, children: [] };

    for (const child of node.childNodes) {
      const childNode = await extractNode(child, images);
      if (childNode != null) {
        result.children.push(childNode);
      }
    }

    return result;
  }

  browser.runtime.onMessage.addListener(clipPage);
}
