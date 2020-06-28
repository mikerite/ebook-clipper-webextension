/* global JSZip */

"use strict";
const ebook = {
  chapters: [],
  images: new Map(),
};

const chapterTabIds = new Set();

async function clip() {
  const elementId = contentIdInput.value.trim();
  if (elementId === "") {
    showClipError("Required");
    return;
  }

  const queryResult = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  const [activeTab] = queryResult;

  if (chapterTabIds.has(activeTab.id)) {
    showClipError("You can't clip chapter pages.");
    return;
  }

  try {
    await browser.tabs.executeScript(activeTab.id, { file: "/utility.js" });
  } catch (exception) {
    if (exception.message === "Missing host permission for the tab") {
      showClipError("You can't clip this page due to security issues.");
    } else {
      throw exception;
    }
  }

  await browser.tabs.executeScript(activeTab.id, {
    file: "/clip.js",
  });

  browser.tabs.sendMessage(activeTab.id, {
    elementId,
    imageUrls: [...ebook.images.keys()],
  });
}

async function handleMessage({ chapter, images, error }) {
  if (error !== undefined) {
    showClipError(error);
    return;
  }

  ebook.chapters.push(chapter);
  for (const [key, value] of images.entries()) {
    if (value !== null) {
      ebook.images.set(key, value);
    }
  }

  const [tableBody] = chapterTable.tBodies;
  const row = tableBody.insertRow();

  const anchor = document.createElement("a");
  anchor.textContent = chapter.title;
  anchor.href = "#";
  anchor.addEventListener("click", (event) => {
    event.preventDefault();
    showChapterTab(chapter);
  });

  const anchorCell = row.insertCell();
  anchorCell.appendChild(anchor);

  const deleteButton = document.createElement("button");
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", (event) => {
    event.preventDefault();
    chapterTable.deleteRow(row.rowIndex);

    const index = ebook.chapters.indexOf(chapter);
    if (index > -1) {
      ebook.chapters.splice(index, 1);
    }
  });

  const deleteCell = row.insertCell();
  deleteCell.appendChild(deleteButton);
}

function showClipError(message) {
  clipErrorDiv.textContent = message;
  clipErrorDiv.style.display = "block";
}

function showSaveError(message) {
  saveErrorDiv.textContent = message;
  saveErrorDiv.style.display = "block";
}

function clearClipError() {
  clipErrorDiv.style.display = "none";
}

function clearSaveError() {
  saveErrorDiv.style.display = "none";
}

function handleClipClick() {
  event.preventDefault();
  clearClipError();
  clip();
}

const CHAPTER_TEMPLATE = `<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <head>
        <meta charset="utf-8" />
        <title />
      </head>
      <body>
      </body>
    </html>
    `;

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

async function buildChapter(chapter, fileNameMap) {
  const parser = new DOMParser();
  const chapterDoc = parser.parseFromString(CHAPTER_TEMPLATE, "text/xml");

  const [title] = chapterDoc.getElementsByTagName("title");
  title.textContent = chapter.title;

  async function build(node) {
    if (typeof node === "string") {
      return chapterDoc.createTextNode(node);
    }

    const { tagName, src, children } = node;
    if (tagName === "IMG") {
      const result = chapterDoc.createElementNS(HTML_NAMESPACE, "img");
      result.setAttribute("src", fileNameMap.get(src));
      return result;
    }

    const result = chapterDoc.createElementNS(
      HTML_NAMESPACE,
      tagName.toLowerCase()
    );
    for (const child of children) {
      result.appendChild(await build(child));
    }

    return result;
  }

  chapterDoc.body.appendChild(await build(chapter.content));

  const serializer = new XMLSerializer();
  return new Blob([serializer.serializeToString(chapterDoc)], {
    type: "text/xml",
  });
}

// Return a random UUID
function getUUID() {
  function getRandomBytes(length) {
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);
    return bytes;
  }

  function toHex(bytes) {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  const result = [];
  result.push(toHex(getRandomBytes(4)));
  result.push(toHex(getRandomBytes(2)));

  let bytes = getRandomBytes(2);
  bytes[0] = (bytes[0] & 0b00001111) | 0b01000000;
  result.push(toHex(bytes));

  bytes = getRandomBytes(2);
  bytes[0] = (bytes[0] & 0b00111111) | 0b10000000;
  result.push(toHex(bytes));

  result.push(toHex(getRandomBytes(6)));

  return result.join("-");
}

async function handleSaveClick() {
  event.preventDefault();
  clearSaveError();

  if (!ebook.chapters.length) {
    showSaveError("No chapters to save!");
    return;
  }

  const title = titleInput.value || "Clippings";

  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip");

  zip.folder("META-INF");
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="utf-8"?>
    <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
      <rootfiles>
        <rootfile media-type="application/oebps-package+xml" full-path="EPUB/package.opf"/>
      </rootfiles>
    </container>
    `
  );

  const OPF_NAMESPACE = "http://www.idpf.org/2007/opf";
  const DUBLIN_CORE_NAMESPACE = "http://purl.org/dc/elements/1.1/";
  const PACKAGE_DOC_TEMPATE = `<?xml version="1.0" encoding="utf-8"?>
    <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
      <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
        <dc:identifier id="id"></dc:identifier>
        <dc:title>Title goes here...</dc:title>
        <dc:language>en</dc:language>
        <meta property="dcterms:modified">2011-01-01T12:00:00Z</meta>
      </metadata>
      <manifest>
        <item id="toc" properties="nav" href="toc.xhtml" media-type="application/xhtml+xml"/>
      </manifest>
      <spine>
      </spine>
    </package>
    `;

  const TOC_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
   <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
   <head>
      <title>Table of Contents</title>
      <meta charset="utf-8"/>
   </head>
   <body>
     <nav epub:type="toc" id="toc">
        <ol>
        </ol>
     </nav>
   </body>
   </html>
    `;

  zip.folder("EPUB");

  const parser = new DOMParser();

  const packageDoc = parser.parseFromString(PACKAGE_DOC_TEMPATE, "text/xml");
  const [manifest] = packageDoc.getElementsByTagName("manifest");
  const [spine] = packageDoc.getElementsByTagName("spine");

  const [identifier] = packageDoc.getElementsByTagNameNS(
    DUBLIN_CORE_NAMESPACE,
    "identifier"
  );
  identifier.textContent = "urn:uuid:" + getUUID();

  const [titleElement] = packageDoc.getElementsByTagNameNS(
    DUBLIN_CORE_NAMESPACE,
    "title"
  );
  titleElement.textContent = title;

  const [metaModified] = packageDoc.querySelectorAll(
    "meta[property='dcterms:modified']"
  );
  metaModified.textContent = new Date().toISOString().replace(/\.\d*Z$/, "Z");

  const tocDoc = parser.parseFromString(TOC_TEMPLATE, "text/xml");

  const [toc] = tocDoc.getElementsByTagName("ol");

  const fileNameMap = new Map();
  let counter = 0;
  for (const [src, blob] of ebook.images.entries()) {
    const fileName = `image${counter}.png`;
    fileNameMap.set(src, fileName);

    const item = packageDoc.createElementNS(OPF_NAMESPACE, "item");
    item.setAttribute("id", fileName);
    item.setAttribute("href", fileName);
    item.setAttribute("media-type", "image/png");
    manifest.appendChild(item);

    zip.file(`EPUB/${fileName}`, blob);

    counter++;
  }

  for (const [i, chapter] of ebook.chapters.entries()) {
    const id = `chapter${i}`;
    const fileName = `${id}.xhtml`;

    zip.file(`EPUB/${fileName}`, buildChapter(chapter, fileNameMap));

    const item = packageDoc.createElementNS(OPF_NAMESPACE, "item");
    item.setAttribute("id", id);
    item.setAttribute("href", fileName);
    item.setAttribute("media-type", "application/xhtml+xml");
    manifest.appendChild(item);

    const itemref = packageDoc.createElementNS(OPF_NAMESPACE, "itemref");
    itemref.setAttribute("idref", id);
    spine.appendChild(itemref);

    const anchor = tocDoc.createElementNS(HTML_NAMESPACE, "a");
    anchor.setAttribute("href", fileName);
    anchor.textContent = chapter.title;
    const listItem = tocDoc.createElementNS(HTML_NAMESPACE, "li");
    listItem.appendChild(anchor);
    toc.appendChild(listItem);
  }

  const serializer = new XMLSerializer();

  zip.file("EPUB/package.opf", serializer.serializeToString(packageDoc));
  zip.file("EPUB/toc.xhtml", serializer.serializeToString(tocDoc));

  const blob = await zip.generateAsync({
    type: "blob",
    mimeType: "application/epub+zip",
  });
  const url = URL.createObjectURL(blob);
  await browser.downloads.download({
    url,
    filename: "clippings.epub",
    saveAs: true,
  });
  URL.revokeObjectURL(blob);
}

async function showChapterTab(chapter) {
  const tab = await browser.tabs.create({ url: "/chapter.html" });
  chapterTabIds.add(tab.id);

  const chapterNumber = ebook.chapters.indexOf(chapter) + 1;
  await browser.tabs.executeScript({ file: "/utility.js" });
  await browser.tabs.executeScript({ file: "/chapter.js" });
  await browser.tabs.sendMessage(tab.id, {
    title: `eBook Clipper: ${chapterNumber}. ${chapter.title}`,
    content: chapter.content,
    images: ebook.images,
  });
}

function handleTabRemoved(tabId) {
  chapterTabIds.delete(tabId);
}

const clipButton = document.getElementById("clip");
clipButton.addEventListener("click", handleClipClick);

const contentIdInput = document.getElementById("content-id");
const clipErrorDiv = document.getElementById("clip-error");
const chapterTable = document.getElementById("chapters");
const saveButton = document.getElementById("save");
saveButton.addEventListener("click", handleSaveClick);

const titleInput = document.getElementById("title");
const saveErrorDiv = document.getElementById("save-error");

browser.runtime.onMessage.addListener(handleMessage);
browser.tabs.onRemoved.addListener(handleTabRemoved);
