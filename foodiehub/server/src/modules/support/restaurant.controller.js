const { Op } = require("sequelize");
const sequelize = require("../../config/database");
const {
  SupportTicket,
  SupportMessage,
  SupportAttachment,
  Restaurant,
  Branch,
  Order,
  User,
} = require("../../models");
const { recordAuditEvent } = require("../../services/audit-log");
const { notifySuperAdmins } = require("../../services/admin-notifications");
const {
  CATEGORIES,
  STATUSES,
  PRIORITIES,
  validateAttachments,
  publicAttachment,
  notifyRestaurant,
} = require("./support.shared");

const fail = (status, message) => Object.assign(new Error(message), { status });
const userAttributes = ["id", "firstName", "lastName", "email"];
const attachmentAttributes = [
  "id",
  "messageId",
  "uploadedByUserId",
  "fileName",
  "contentType",
  "sizeBytes",
  "createdAt",
];
const ticketIncludes = [
  {
    model: Restaurant,
    as: "restaurant",
    attributes: ["id", "name", "email", "phone"],
  },
  { model: User, as: "creator", attributes: userAttributes },
  {
    model: Branch,
    as: "relatedBranch",
    attributes: ["id", "name"],
    required: false,
  },
  {
    model: Order,
    as: "relatedOrder",
    attributes: ["id", "orderNumber", "status"],
    required: false,
  },
  {
    model: SupportAttachment,
    as: "attachments",
    attributes: attachmentAttributes,
    required: false,
  },
  {
    model: SupportMessage,
    as: "messages",
    required: false,
    separate: true,
    order: [["createdAt", "ASC"]],
    include: [
      { model: User, as: "author", attributes: userAttributes },
      {
        model: SupportAttachment,
        as: "attachments",
        attributes: attachmentAttributes,
        required: false,
      },
    ],
  },
];

function validateTicketInput({
  subject,
  category,
  description,
  priority = "normal",
}) {
  if (
    typeof subject !== "string" ||
    subject.trim().length < 4 ||
    subject.trim().length > 180
  )
    throw fail(400, "Subject must be between 4 and 180 characters.");
  if (!CATEGORIES.includes(category))
    throw fail(400, "Choose a valid support category.");
  if (
    typeof description !== "string" ||
    description.trim().length < 10 ||
    description.trim().length > 10000
  )
    throw fail(400, "Description must be between 10 and 10,000 characters.");
  if (!PRIORITIES.includes(priority))
    throw fail(400, "Choose a valid priority.");
}

async function findRestaurantTicket(req, ticketId, options = {}) {
  const ticket = await SupportTicket.findOne({
    where: { id: ticketId, restaurantId: req.restaurant.id },
    ...options,
  });
  if (!ticket) throw fail(404, "Support ticket not found.");
  return ticket;
}

function serializeTicket(ticket) {
  const output = ticket.toJSON();
  output.attachments = (output.attachments || []).map(publicAttachment);
  output.messages = (output.messages || []).map((message) => ({
    ...message,
    attachments: (message.attachments || []).map(publicAttachment),
  }));
  return output;
}

exports.listTickets = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, Number(req.query.pageSize) || 10),
    );
    const where = { restaurantId: req.restaurant.id };
    if (req.query.status && STATUSES.includes(req.query.status))
      where.status = req.query.status;
    if (req.query.category && CATEGORIES.includes(req.query.category))
      where.category = req.query.category;
    if (req.query.priority && PRIORITIES.includes(req.query.priority))
      where.priority = req.query.priority;
    if (typeof req.query.search === "string" && req.query.search.trim()) {
      const search = `%${req.query.search.trim().slice(0, 100)}%`;
      where[Op.or] = [
        { reference: { [Op.like]: search } },
        { subject: { [Op.like]: search } },
      ];
    }
    const [result, statusGroups] = await Promise.all([
      SupportTicket.findAndCountAll({
        where,
        include: [
          {
            model: Branch,
            as: "relatedBranch",
            attributes: ["id", "name"],
            required: false,
          },
        ],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        order: [["updatedAt", "DESC"]],
      }),
      SupportTicket.findAll({
        where: { restaurantId: req.restaurant.id },
        attributes: [
          "status",
          [sequelize.fn("COUNT", sequelize.col("id")), "count"],
        ],
        group: ["status"],
        raw: true,
      }),
    ]);
    const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    for (const entry of statusGroups)
      counts[entry.status] = Number(entry.count);
    res.json({
      success: true,
      tickets: result.rows,
      summary: {
        total: Object.values(counts).reduce((sum, value) => sum + value, 0),
        open: counts.open,
        inProgress: counts.in_progress,
        resolved: counts.resolved,
      },
      pagination: {
        page,
        pageSize,
        total: result.count,
        totalPages: Math.ceil(result.count / pageSize),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.ticketOptions = async (req, res, next) => {
  try {
    const [branches, orders] = await Promise.all([
      Branch.findAll({
        where: {
          restaurantId: req.restaurant.id,
          ...(req.restaurantBranchIds
            ? { id: { [Op.in]: req.restaurantBranchIds } }
            : {}),
        },
        attributes: ["id", "name"],
        order: [["name", "ASC"]],
      }),
      Order.findAll({
        where: {
          restaurantId: req.restaurant.id,
          ...(req.restaurantBranchIds
            ? { branchId: { [Op.in]: req.restaurantBranchIds } }
            : {}),
        },
        attributes: ["id", "orderNumber", "createdAt"],
        order: [["createdAt", "DESC"]],
        limit: 50,
      }),
    ]);
    res.json({ success: true, branches, orders });
  } catch (error) {
    next(error);
  }
};

exports.createTicket = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      subject,
      category,
      description,
      priority = "normal",
      relatedBranchId = null,
      relatedOrderId = null,
    } = req.body || {};
    validateTicketInput({ subject, category, description, priority });
    if (relatedBranchId) {
      const branch = await Branch.findOne({
        where: {
          id: relatedBranchId,
          restaurantId: req.restaurant.id,
          ...(req.restaurantBranchIds
            ? {
                id: {
                  [Op.and]: [
                    relatedBranchId,
                    { [Op.in]: req.restaurantBranchIds },
                  ],
                },
              }
            : {}),
        },
        transaction,
      });
      if (!branch)
        throw fail(
          400,
          "Choose a branch belonging to your restaurant and your assigned branches.",
        );
    }
    if (relatedOrderId) {
      const order = await Order.findOne({
        where: {
          id: relatedOrderId,
          restaurantId: req.restaurant.id,
          ...(req.restaurantBranchIds
            ? { branchId: { [Op.in]: req.restaurantBranchIds } }
            : {}),
        },
        transaction,
      });
      if (!order)
        throw fail(
          400,
          "Choose an order belonging to your restaurant and your assigned branches.",
        );
    }
    const attachments = validateAttachments(req.body?.attachments);
    const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const reference = `FHT-${stamp}-${require("crypto").randomBytes(4).toString("hex").toUpperCase()}`;
    const ticket = await SupportTicket.create(
      {
        reference,
        restaurantId: req.restaurant.id,
        createdByUserId: req.authUser.id,
        relatedBranchId,
        relatedOrderId,
        subject: subject.trim(),
        category,
        description: description.trim(),
        priority,
        status: "open",
      },
      { transaction },
    );
    for (const attachment of attachments)
      await SupportAttachment.create(
        {
          ...attachment,
          ticketId: ticket.id,
          uploadedByUserId: req.authUser.id,
        },
        { transaction },
      );
    await recordAuditEvent(
      req,
      {
        action: "support.ticket.created",
        entityType: "support_ticket",
        entityId: ticket.id,
        afterData: {
          reference,
          restaurantId: req.restaurant.id,
          category,
          priority,
          status: "open",
        },
      },
      { transaction },
    );
    await transaction.commit();
    notifySuperAdmins(req, {
      type: "support_ticket_created",
      title: "New restaurant support ticket",
      message: `${req.restaurant.name}: ${ticket.reference} · ${ticket.subject}`,
      entityId: ticket.id,
      href: `/admin/support?ticketId=${ticket.id}`,
    });
    notifyRestaurant(req, req.restaurant.id, {
      type: "created",
      ticketId: ticket.id,
      reference: ticket.reference,
      title: "Support ticket submitted",
      message: `${ticket.reference} was submitted to FoodieHub support.`,
      status: ticket.status,
    });
    res
      .status(201)
      .json({
        success: true,
        ticket: {
          id: ticket.id,
          reference,
          subject: ticket.subject,
          category: ticket.category,
          priority: ticket.priority,
          status: ticket.status,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
        },
        message: "Support ticket submitted.",
      });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  }
};

exports.ticketDetails = async (req, res, next) => {
  try {
    const ticket = await SupportTicket.findOne({
      where: { id: req.params.ticketId, restaurantId: req.restaurant.id },
      include: ticketIncludes,
    });
    if (!ticket) throw fail(404, "Support ticket not found.");
    res.json({ success: true, ticket: serializeTicket(ticket) });
  } catch (error) {
    next(error);
  }
};

exports.reply = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (body.length < 1 || body.length > 6000)
      throw fail(400, "Reply must be between 1 and 6,000 characters.");
    const attachments = validateAttachments(req.body?.attachments);
    const ticket = await findRestaurantTicket(req, req.params.ticketId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (ticket.status === "closed")
      throw fail(
        409,
        "This ticket is closed. Create a new ticket if you need more help.",
      );
    const previousStatus = ticket.status;
    const message = await SupportMessage.create(
      {
        ticketId: ticket.id,
        authorUserId: req.authUser.id,
        authorType: "restaurant",
        body,
      },
      { transaction },
    );
    for (const attachment of attachments)
      await SupportAttachment.create(
        {
          ...attachment,
          ticketId: ticket.id,
          messageId: message.id,
          uploadedByUserId: req.authUser.id,
        },
        { transaction },
      );
    const status = ["waiting_for_restaurant", "resolved"].includes(
      previousStatus,
    )
      ? "in_progress"
      : previousStatus;
    await ticket.update({ status, lastReplyAt: new Date() }, { transaction });
    await recordAuditEvent(
      req,
      {
        action: "support.ticket.restaurant_replied",
        entityType: "support_ticket",
        entityId: ticket.id,
        beforeData: { status: previousStatus },
        afterData: { status, messageId: message.id },
      },
      { transaction },
    );
    await transaction.commit();
    notifySuperAdmins(req, {
      type:
        previousStatus === "resolved"
          ? "support_ticket_reopened"
          : "support_ticket_reply",
      title:
        previousStatus === "resolved"
          ? "Resolved ticket reopened"
          : "Restaurant replied to support",
      message: `${req.restaurant.name}: ${ticket.reference} · ${ticket.subject}`,
      entityId: ticket.id,
      href: `/admin/support?ticketId=${ticket.id}`,
    });
    res
      .status(201)
      .json({
        success: true,
        message: {
          id: message.id,
          body: message.body,
          authorType: "restaurant",
          createdAt: message.createdAt,
        },
        status,
      });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    next(error);
  }
};

exports.downloadAttachment = async (req, res, next) => {
  try {
    const attachment = await SupportAttachment.findOne({
      where: { id: req.params.attachmentId },
      include: [
        {
          model: SupportTicket,
          as: "ticket",
          where: { restaurantId: req.restaurant.id },
          attributes: ["id"],
        },
      ],
    });
    if (!attachment) throw fail(404, "Attachment not found.");
    res.set({
      "Content-Type": attachment.contentType,
      "Content-Length": String(attachment.sizeBytes),
      "Content-Disposition": `attachment; filename="${attachment.fileName.replace(/["\\\r\n]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
    res.send(attachment.fileData);
  } catch (error) {
    next(error);
  }
};

exports.validateTicketInput = validateTicketInput;
