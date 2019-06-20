/* global TAG_WHITELIST */
"use strict";

browser.runtime.onMessage.addListener(({ title, content, images }) => {
  document.title = title;
  buildPage(content, images);
});

function toDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(blob);
  });
}

async function buildPage(content, images) {
  document.body.appendChild(await build(content, images));
}

async function build(node, images) {
  if (typeof node === "string") {
    return document.createTextNode(node);
  }

  const { tagName, children } = node;
  if (!TAG_WHITELIST.includes(tagName)) {
    throw `Invalid tag ${tagName}`;
  }

  if (tagName === "IMG") {
    const result = document.createElement("IMG");
    result.src = await toDataURL(images.get(node.src));
    return result;
  }

  const result = document.createElement(tagName);
  for (const child of children) {
    result.appendChild(await build(child, images));
  }

  return result;
}
