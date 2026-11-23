const path = require("path");

const CATEGORIES = [
  "Account & Login",
  "Restaurant Profile",
  "Branch Management",
  "Employee & Permissions",
  "Menu & Food Items",
  "Orders",
  "Kitchen & Tables",
  "QR Code Issues",
  "Payments & Refunds",
  "Subscription & Billing",
  "Technical Issues",
  "Other",
];
const STATUSES = [
  "open",
  "in_progress",
  "waiting_for_restaurant",
  "resolved",
  "closed",
];
const PRIORITIES = ["low", "normal", "high", "urgent"];
const MAX_FILE_BYTES = 700 * 1024;
const MAX_TOTAL_FILE_BYTES = 1024 * 1024;
const MAX_FILES = 3;
const MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
]);

function validateAttachments(input) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > MAX_FILES)
    throw Object.assign(new Error(`Attach no more than ${MAX_FILES} files.`), {
      status: 400,
    });
  let totalBytes = 0;
  return input.map((item) => {
    if (!item || typeof item !== "object")
      throw Object.assign(new Error("An attachment is invalid."), {
        status: 400,
      });
    const match =
      typeof item.dataUrl === "string" &&
      item.dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match)
      throw Object.assign(new Error("An attachment could not be read."), {
        status: 400,
      });
    const contentType = match[1].toLowerCase();
    const encoded = match[2];
    if (!MIME_TYPES.has(contentType) || encoded.length % 4 !== 0)
      throw Object.assign(
        new Error("Use PNG, JPG, WebP, PDF or plain text attachments."),
        { status: 400 },
      );
    const data = Buffer.from(encoded, "base64");
    if (
      !data.length ||
      data.toString("base64") !== encoded ||
      data.length > MAX_FILE_BYTES
    )
      throw Object.assign(
        new Error("Each attachment must be smaller than 700 KB."),
        { status: 400 },
      );
    if (
      contentType === "image/png" &&
      !data
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      throw Object.assign(new Error("The PNG file content is invalid."), {
        status: 400,
      });
    if (
      contentType === "image/jpeg" &&
      !(
        data[0] === 0xff &&
        data[1] === 0xd8 &&
        data[data.length - 2] === 0xff &&
        data[data.length - 1] === 0xd9
      )
    )
      throw Object.assign(new Error("The JPG file content is invalid."), {
        status: 400,
      });
    if (
      contentType === "image/webp" &&
      (data.toString("ascii", 0, 4) !== "RIFF" ||
        data.toString("ascii", 8, 12) !== "WEBP")
    )
      throw Object.assign(new Error("The WebP file content is invalid."), {
        status: 400,
      });
    if (
      contentType === "application/pdf" &&
      data.toString("ascii", 0, 5) !== "%PDF-"
    )
      throw Object.assign(new Error("The PDF file content is invalid."), {
        status: 400,
      });
    if (
      contentType === "text/plain" &&
      (data.includes(0) ||
        !Buffer.from(data.toString("utf8"), "utf8").equals(data))
    )
      throw Object.assign(
        new Error("The text attachment must use UTF-8 encoding."),
        { status: 400 },
      );
    totalBytes += data.length;
    if (totalBytes > MAX_TOTAL_FILE_BYTES)
      throw Object.assign(
        new Error("Attachments must total no more than 1 MB."),
        { status: 400 },
      );
    const rawName =
      typeof item.fileName === "string"
        ? path.basename(item.fileName.replace(/\\/g, "/"))
        : "";
    const fileName =
      rawName.replace(/[^\p{L}\p{N}._() -]/gu, "_").slice(0, 180) ||
      "attachment";
    return { fileName, contentType, sizeBytes: data.length, fileData: data };
  });
}

function publicAttachment(attachment) {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt,
  };
}

function notifyRestaurant(req, restaurantId, event) {
  if (!restaurantId) return null;
  const io = req.app?.get?.("io");
  if (!io) return null;
  const payload = {
    type: String(event.type || "support_updated"),
    ticketId: String(event.ticketId),
    reference: String(event.reference || ""),
    title: String(event.title || "Support ticket updated").slice(0, 120),
    message: String(event.message || "").slice(0, 500),
    status: event.status || null,
    createdAt: new Date().toISOString(),
  };
  io.to(`restaurant-support:${restaurantId}`).emit(
    "restaurant:support-updated",
    payload,
  );
  return payload;
}

module.exports = {
  CATEGORIES,
  STATUSES,
  PRIORITIES,
  MAX_FILE_BYTES,
  MAX_TOTAL_FILE_BYTES,
  MAX_FILES,
  MIME_TYPES,
  validateAttachments,
  publicAttachment,
  notifyRestaurant,
};
