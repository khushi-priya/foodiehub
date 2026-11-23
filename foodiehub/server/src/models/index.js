const User = require('./User');
const Role = require('./Role');
const Permission = require('./Permission');
const RolePermission = require('./RolePermission');
const UserRole = require('./UserRole');

const Restaurant = require('./Restaurant');
const RestaurantMember = require('./RestaurantMember');
const Branch = require('./Branch');
const RestaurantTable = require('./RestaurantTable');
const Reservation = require('./Reservation');
const TableOperationEvent = require('./TableOperationEvent');
const EmployeeBranchAssignment = require('./EmployeeBranchAssignment');
const AttendanceRecord = require('./AttendanceRecord');
const RestaurantInvitation = require('./RestaurantInvitation');

const Order = require('./Order');
const OrderItem = require('./OrderItem');
const OrderRefund = require('./OrderRefund');
const OrderPaymentAttempt = require('./OrderPaymentAttempt');
const KitchenStatusHistory = require('./KitchenStatusHistory');
const DeliveryAssignment = require('./DeliveryAssignment');
const DeliveryStatusHistory = require('./DeliveryStatusHistory');
const DeliverySetting = require('./DeliverySetting');
const DeliveryLocation = require('./DeliveryLocation');
const MenuCategory = require('./MenuCategory');
const FoodCategoryRequest = require('./FoodCategoryRequest');
const FoodCategoryRequestHistory = require('./FoodCategoryRequestHistory');
const MenuItem = require('./MenuItem');
const MenuItemOption = require('./MenuItemOption');
const CustomerAddress = require('./CustomerAddress');
const CustomerWishlistItem = require('./CustomerWishlistItem');
const CustomerCart = require('./CustomerCart');
const CustomerCartItem = require('./CustomerCartItem');
const CustomerReorderRequest = require('./CustomerReorderRequest');
const AuditLog = require('./AuditLog');
const SubscriptionPlan = require('./SubscriptionPlan');
const RestaurantSubscription = require('./RestaurantSubscription');
const SubscriptionPayment = require('./SubscriptionPayment');
const PlatformFoodCoupon = require('./PlatformFoodCoupon');
const PlatformFoodCouponRedemption = require('./PlatformFoodCouponRedemption');
const SubscriptionCoupon = require('./SubscriptionCoupon');
const SubscriptionCouponRedemption = require('./SubscriptionCouponRedemption');
const CommissionRule = require('./CommissionRule');
const CommissionRecord = require('./CommissionRecord');
const CommissionSettlement = require('./CommissionSettlement');
const CommissionSettlementItem = require('./CommissionSettlementItem');
const PlatformSetting = require('./PlatformSetting');
const RestaurantFoodCoupon = require('./RestaurantFoodCoupon');
const RestaurantFoodCouponRedemption = require('./RestaurantFoodCouponRedemption');
const SupportTicket = require('./SupportTicket');
const SupportMessage = require('./SupportMessage');
const SupportAttachment = require('./SupportAttachment');
const InventoryItem = require('./InventoryItem');
const InventoryMovement = require('./InventoryMovement');
const InventorySupplier = require('./InventorySupplier');
const InventoryPurchaseOrder = require('./InventoryPurchaseOrder');
const InventoryPurchaseOrderItem = require('./InventoryPurchaseOrderItem');
const InventoryRecipe = require('./InventoryRecipe');
const InventoryRecipeIngredient = require('./InventoryRecipeIngredient');
const PosOrderRequest = require('./PosOrderRequest');
const PosTender = require('./PosTender');
const CustomerNotification = require('./CustomerNotification');
const CustomerNotificationPreference = require('./CustomerNotificationPreference');
const CodCollection = require('./CodCollection');
const CashHandover = require('./CashHandover');
const CashHandoverItem = require('./CashHandoverItem');
const RazorpayWebhookEvent = require('./RazorpayWebhookEvent');

// Platform user roles
User.belongsToMany(Role, {
  through: UserRole,
  foreignKey: 'userId',
  otherKey: 'roleId',
  as: 'roles',
});

Role.belongsToMany(User, {
  through: UserRole,
  foreignKey: 'roleId',
  otherKey: 'userId',
  as: 'users',
});

// Role permissions
Role.belongsToMany(Permission, {
  through: RolePermission,
  foreignKey: 'roleId',
  otherKey: 'permissionId',
  as: 'permissions',
});

Permission.belongsToMany(Role, {
  through: RolePermission,
  foreignKey: 'permissionId',
  otherKey: 'roleId',
  as: 'roles',
});

// Restaurant relationships
Restaurant.hasMany(Role, { foreignKey: 'restaurantId', as: 'customRoles' });
Role.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
Restaurant.hasMany(RestaurantMember, {
  foreignKey: 'restaurantId',
  as: 'members',
});

RestaurantMember.belongsTo(Restaurant, {
  foreignKey: 'restaurantId',
  as: 'restaurant',
});

User.hasMany(RestaurantMember, {
  foreignKey: 'userId',
  as: 'restaurantMemberships',
});

RestaurantMember.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});

Role.hasMany(RestaurantMember, {
  foreignKey: 'roleId',
  as: 'restaurantMembers',
});

RestaurantMember.belongsTo(Role, {
  foreignKey: 'roleId',
  as: 'role',
});

// Branch relationships
Restaurant.hasMany(Branch, {
  foreignKey: 'restaurantId',
  as: 'branches',
});

Branch.belongsTo(Restaurant, {
  foreignKey: 'restaurantId',
  as: 'restaurant',
});
Restaurant.hasMany(RestaurantTable, { foreignKey: 'restaurantId', as: 'tables', onDelete: 'CASCADE' });
RestaurantTable.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
Branch.hasMany(RestaurantTable, { foreignKey: 'branchId', as: 'tables', onDelete: 'CASCADE' });
RestaurantTable.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
RestaurantTable.belongsTo(RestaurantMember, { foreignKey: 'assignedWaiterMemberId', as: 'assignedWaiter' });
RestaurantMember.hasMany(RestaurantTable, { foreignKey: 'assignedWaiterMemberId', as: 'assignedTables' });
RestaurantTable.hasMany(Reservation, { foreignKey: 'tableId', as: 'reservations' });
Reservation.belongsTo(RestaurantTable, { foreignKey: 'tableId', as: 'table' });
Restaurant.hasMany(Reservation, { foreignKey: 'restaurantId', as: 'reservations' });
Reservation.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
Branch.hasMany(Reservation, { foreignKey: 'branchId', as: 'reservations' });
Reservation.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
User.hasMany(Reservation, { foreignKey: 'customerId', as: 'reservations' });
Reservation.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });
RestaurantTable.hasMany(TableOperationEvent, { foreignKey: 'tableId', as: 'operationEvents' });
TableOperationEvent.belongsTo(RestaurantTable, { foreignKey: 'tableId', as: 'table' });
TableOperationEvent.belongsTo(RestaurantTable, { foreignKey: 'relatedTableId', as: 'relatedTable' });
Order.hasMany(TableOperationEvent, { foreignKey: 'orderId', as: 'tableOperationEvents' });
TableOperationEvent.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

User.hasMany(CustomerAddress, { foreignKey: 'customerId', as: 'customerAddresses' });
CustomerAddress.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });
User.hasMany(CustomerWishlistItem, { foreignKey: 'customerId', as: 'wishlistItems' });
CustomerWishlistItem.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });
User.hasOne(CustomerNotificationPreference, { foreignKey: 'customerId', as: 'notificationPreferences' });
CustomerNotificationPreference.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });
User.hasMany(CustomerNotification, { foreignKey: 'customerId', as: 'notifications' });
CustomerNotification.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });
User.hasOne(CustomerCart, { foreignKey: 'customerId', as: 'customerCart' });
CustomerCart.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });
Restaurant.hasMany(CustomerCart, { foreignKey: 'restaurantId', as: 'customerCarts' });
CustomerCart.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
Branch.hasMany(CustomerCart, { foreignKey: 'branchId', as: 'customerCarts' });
CustomerCart.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
RestaurantTable.hasMany(CustomerCart, { foreignKey: 'tableId', as: 'customerCarts' });
CustomerCart.belongsTo(RestaurantTable, { foreignKey: 'tableId', as: 'table' });
User.hasMany(AuditLog, { foreignKey: 'actorUserId', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'actorUserId', as: 'actor' });
CustomerCart.hasMany(CustomerCartItem, { foreignKey: 'cartId', as: 'items', onDelete: 'CASCADE' });
CustomerCartItem.belongsTo(CustomerCart, { foreignKey: 'cartId', as: 'cart' });
MenuItem.hasMany(CustomerCartItem, { foreignKey: 'menuItemId', as: 'cartItems' });
CustomerCartItem.belongsTo(MenuItem, { foreignKey: 'menuItemId', as: 'menuItem' });
Restaurant.hasMany(CustomerWishlistItem, { foreignKey: 'restaurantId', as: 'customerWishlists' });
CustomerWishlistItem.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
MenuItem.hasMany(CustomerWishlistItem, { foreignKey: 'menuItemId', as: 'customerWishlists' });
CustomerWishlistItem.belongsTo(MenuItem, { foreignKey: 'menuItemId', as: 'menuItem' });

// Employee branch assignments
RestaurantMember.hasMany(EmployeeBranchAssignment, {
  foreignKey: 'restaurantMemberId',
  as: 'branchAssignments',
});

EmployeeBranchAssignment.belongsTo(RestaurantMember, {
  foreignKey: 'restaurantMemberId',
  as: 'restaurantMember',
});

Branch.hasMany(EmployeeBranchAssignment, {
  foreignKey: 'branchId',
  as: 'employeeAssignments',
});

EmployeeBranchAssignment.belongsTo(Branch, {
  foreignKey: 'branchId',
  as: 'branch',
});

User.hasMany(EmployeeBranchAssignment, {
  foreignKey: 'assignedByUserId',
  as: 'branchAssignmentsCreated',
});

EmployeeBranchAssignment.belongsTo(User, {
  foreignKey: 'assignedByUserId',
  as: 'assignedBy',
});

RestaurantMember.hasMany(AttendanceRecord, { foreignKey: 'restaurantMemberId', as: 'attendanceRecords' });
AttendanceRecord.belongsTo(RestaurantMember, { foreignKey: 'restaurantMemberId', as: 'restaurantMember' });
AttendanceRecord.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
RestaurantInvitation.belongsTo(RestaurantMember, { foreignKey: 'restaurantMemberId', as: 'restaurantMember' });

// Restaurant subscription plans, periods, and verified payment history.
SubscriptionPlan.hasMany(RestaurantSubscription, { foreignKey: 'planId', as: 'subscriptions' });
RestaurantSubscription.belongsTo(SubscriptionPlan, { foreignKey: 'planId', as: 'plan' });
Restaurant.hasMany(RestaurantSubscription, { foreignKey: 'restaurantId', as: 'subscriptions' });
RestaurantSubscription.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
RestaurantSubscription.hasMany(SubscriptionPayment, { foreignKey: 'subscriptionId', as: 'payments', onDelete: 'CASCADE' });
SubscriptionPayment.belongsTo(RestaurantSubscription, { foreignKey: 'subscriptionId', as: 'subscription' });
SubscriptionPayment.belongsTo(SubscriptionPlan, { foreignKey: 'planId', as: 'plan' });
SubscriptionPayment.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
PlatformFoodCoupon.hasMany(PlatformFoodCouponRedemption, { foreignKey: 'couponId', as: 'redemptions' });
PlatformFoodCouponRedemption.belongsTo(PlatformFoodCoupon, { foreignKey: 'couponId', as: 'coupon' });
PlatformFoodCouponRedemption.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });
PlatformFoodCouponRedemption.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
SubscriptionCoupon.hasMany(SubscriptionCouponRedemption, { foreignKey: 'couponId', as: 'redemptions' });
SubscriptionCouponRedemption.belongsTo(SubscriptionCoupon, { foreignKey: 'couponId', as: 'coupon' });
SubscriptionCouponRedemption.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
SubscriptionCouponRedemption.belongsTo(SubscriptionPayment, { foreignKey: 'paymentId', as: 'payment' });
RestaurantFoodCoupon.hasMany(RestaurantFoodCouponRedemption, { foreignKey: 'couponId', as: 'redemptions' });
RestaurantFoodCouponRedemption.belongsTo(RestaurantFoodCoupon, { foreignKey: 'couponId', as: 'coupon' });
RestaurantFoodCouponRedemption.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
RestaurantFoodCouponRedemption.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });
RestaurantFoodCouponRedemption.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
CommissionRule.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
CommissionRecord.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
CommissionRecord.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
CommissionRecord.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
CommissionRecord.belongsTo(CommissionRule, { foreignKey: 'ruleId', as: 'rule' });
CommissionRecord.belongsTo(CommissionRecord, { foreignKey: 'adjustsRecordId', as: 'adjustsRecord' });
CommissionSettlement.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
CommissionSettlement.belongsTo(User, { foreignKey: 'recordedBy', as: 'recorder' });
CommissionSettlement.hasMany(CommissionSettlementItem, { foreignKey: 'settlementId', as: 'items' });
CommissionSettlementItem.belongsTo(CommissionSettlement, { foreignKey: 'settlementId', as: 'settlement' });
CommissionSettlementItem.belongsTo(CommissionRecord, { foreignKey: 'commissionRecordId', as: 'commissionRecord' });
CommissionRecord.hasOne(CommissionSettlementItem, { foreignKey: 'commissionRecordId', as: 'settlementItem' });

// Order relationships
Restaurant.hasMany(MenuCategory, { foreignKey: 'restaurantId', as: 'menuCategories' });
MenuCategory.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
MenuCategory.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
FoodCategoryRequest.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
FoodCategoryRequest.belongsTo(User, { foreignKey: 'requestedBy', as: 'requester' });
FoodCategoryRequest.belongsTo(User, { foreignKey: 'reviewedBy', as: 'reviewer' });
FoodCategoryRequest.belongsTo(MenuCategory, { foreignKey: 'approvedCategoryId', as: 'approvedCategory' });
Restaurant.hasMany(FoodCategoryRequest, { foreignKey: 'restaurantId', as: 'foodCategoryRequests' });
FoodCategoryRequest.hasMany(FoodCategoryRequestHistory, { foreignKey: 'requestId', as: 'history', onDelete: 'CASCADE' });
FoodCategoryRequestHistory.belongsTo(FoodCategoryRequest, { foreignKey: 'requestId', as: 'request' });
FoodCategoryRequestHistory.belongsTo(User, { foreignKey: 'performedBy', as: 'performer' });
Restaurant.hasMany(MenuItem, { foreignKey: 'restaurantId', as: 'menuItems' });
MenuItem.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
MenuCategory.hasMany(MenuItem, { foreignKey: 'categoryId', as: 'items' });
MenuItem.belongsTo(MenuCategory, { foreignKey: 'categoryId', as: 'category' });
MenuItem.hasMany(MenuItemOption, { foreignKey: 'menuItemId', as: 'options' });
MenuItemOption.belongsTo(MenuItem, { foreignKey: 'menuItemId', as: 'menuItem' });
Restaurant.hasMany(MenuItemOption, { foreignKey: 'restaurantId', as: 'menuOptions' });
MenuItemOption.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });

// Order relationships
Restaurant.hasMany(Order, {
  foreignKey: 'restaurantId',
  as: 'orders',
});

Order.belongsTo(Restaurant, {
  foreignKey: 'restaurantId',
  as: 'restaurant',
});
Branch.hasMany(Order, { foreignKey: 'branchId', as: 'orders' });
Order.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
RestaurantTable.hasMany(Order, { foreignKey: 'tableId', as: 'orders' });
Order.belongsTo(RestaurantTable, { foreignKey: 'tableId', as: 'table' });

User.hasMany(Order, {
  foreignKey: 'customerId',
  as: 'customerOrders',
});

Order.belongsTo(User, {
  foreignKey: 'customerId',
  as: 'customer',
});

Order.hasMany(OrderItem, {
  foreignKey: 'orderId',
  as: 'items',
});

OrderItem.belongsTo(Order, {
  foreignKey: 'orderId',
  as: 'order',
});
Order.hasOne(OrderRefund, { foreignKey: 'orderId', as: 'refund' });
OrderRefund.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
Order.hasMany(OrderPaymentAttempt, { foreignKey: 'orderId', as: 'paymentAttempts' });
OrderPaymentAttempt.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
OrderPaymentAttempt.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
OrderPaymentAttempt.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
Order.hasMany(CodCollection, { foreignKey: 'orderId', as: 'codCollections' });
CodCollection.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
DeliveryAssignment.hasMany(CodCollection, { foreignKey: 'assignmentId', as: 'codCollections' });
CodCollection.belongsTo(DeliveryAssignment, { foreignKey: 'assignmentId', as: 'assignment' });
CodCollection.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
CodCollection.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
CodCollection.belongsTo(RestaurantMember, { foreignKey: 'restaurantMemberId', as: 'deliveryEmployee' });
CodCollection.hasMany(CashHandoverItem, { foreignKey: 'codCollectionId', as: 'handoverItems' });
CashHandover.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
CashHandover.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
CashHandover.belongsTo(RestaurantMember, { foreignKey: 'restaurantMemberId', as: 'deliveryEmployee' });
CashHandover.belongsTo(User, { foreignKey: 'receivedByUserId', as: 'receiver' });
CashHandover.hasMany(CashHandoverItem, { foreignKey: 'handoverId', as: 'items' });
CashHandoverItem.belongsTo(CashHandover, { foreignKey: 'handoverId', as: 'handover' });
CashHandoverItem.belongsTo(CodCollection, { foreignKey: 'codCollectionId', as: 'collection' });
Order.hasMany(PosTender, { foreignKey: 'orderId', as: 'posTenders' });
PosTender.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
Order.hasOne(PosOrderRequest, { foreignKey: 'orderId', as: 'posRequest' });
PosOrderRequest.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
OrderItem.belongsTo(MenuItem, { foreignKey: 'menuItemId', as: 'menuItem' });
Order.hasMany(DeliveryAssignment, { foreignKey: 'orderId', as: 'deliveryAssignments' });
Order.hasMany(KitchenStatusHistory, { foreignKey: 'orderId', as: 'kitchenHistory' });
KitchenStatusHistory.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
KitchenStatusHistory.belongsTo(User, { foreignKey: 'performedByUserId', as: 'performer' });
KitchenStatusHistory.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
KitchenStatusHistory.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
DeliveryAssignment.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
DeliveryAssignment.hasOne(DeliveryLocation, { foreignKey: 'assignmentId', as: 'liveLocation', onDelete: 'CASCADE' });
DeliveryLocation.belongsTo(DeliveryAssignment, { foreignKey: 'assignmentId', as: 'assignment' });
Restaurant.hasMany(DeliveryAssignment, { foreignKey: 'restaurantId', as: 'deliveryAssignments' });
DeliveryAssignment.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
Branch.hasMany(DeliveryAssignment, { foreignKey: 'branchId', as: 'deliveryAssignments' });
DeliveryAssignment.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
RestaurantMember.hasMany(DeliveryAssignment, { foreignKey: 'restaurantMemberId', as: 'deliveryAssignments' });
DeliveryAssignment.belongsTo(RestaurantMember, { foreignKey: 'restaurantMemberId', as: 'deliveryEmployee' });
User.hasMany(DeliveryAssignment, { foreignKey: 'assignedByUserId', as: 'deliveryAssignmentsCreated' });
DeliveryAssignment.belongsTo(User, { foreignKey: 'assignedByUserId', as: 'assigner' });
DeliveryAssignment.hasMany(DeliveryStatusHistory, { foreignKey: 'assignmentId', as: 'history' });
DeliveryStatusHistory.belongsTo(DeliveryAssignment, { foreignKey: 'assignmentId', as: 'assignment' });
DeliveryStatusHistory.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
DeliveryStatusHistory.belongsTo(RestaurantMember, { foreignKey: 'restaurantMemberId', as: 'deliveryEmployee' });
DeliveryStatusHistory.belongsTo(User, { foreignKey: 'performedByUserId', as: 'performer' });

Restaurant.hasMany(SupportTicket, { foreignKey: 'restaurantId', as: 'supportTickets' });
SupportTicket.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });
SupportTicket.belongsTo(User, { foreignKey: 'createdByUserId', as: 'creator' });
SupportTicket.belongsTo(User, { foreignKey: 'assignedAdminUserId', as: 'assignedAdmin' });
SupportTicket.belongsTo(Branch, { foreignKey: 'relatedBranchId', as: 'relatedBranch' });
SupportTicket.belongsTo(Order, { foreignKey: 'relatedOrderId', as: 'relatedOrder' });
SupportTicket.hasMany(SupportMessage, { foreignKey: 'ticketId', as: 'messages', onDelete: 'CASCADE' });
SupportMessage.belongsTo(SupportTicket, { foreignKey: 'ticketId', as: 'ticket' });
SupportMessage.belongsTo(User, { foreignKey: 'authorUserId', as: 'author' });
SupportTicket.hasMany(SupportAttachment, { foreignKey: 'ticketId', as: 'attachments', onDelete: 'CASCADE' });
SupportAttachment.belongsTo(SupportTicket, { foreignKey: 'ticketId', as: 'ticket' });
SupportMessage.hasMany(SupportAttachment, { foreignKey: 'messageId', as: 'attachments', onDelete: 'CASCADE' });
SupportAttachment.belongsTo(SupportMessage, { foreignKey: 'messageId', as: 'message' });
SupportAttachment.belongsTo(User, { foreignKey: 'uploadedByUserId', as: 'uploader' });

// Branch-scoped inventory and purchasing records.
InventoryItem.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
Branch.hasMany(InventoryItem, { foreignKey: 'branchId', as: 'inventoryItems' });
InventoryItem.hasMany(InventoryMovement, { foreignKey: 'inventoryItemId', as: 'movements' });
InventoryMovement.belongsTo(InventoryItem, { foreignKey: 'inventoryItemId', as: 'item' });
InventoryPurchaseOrder.belongsTo(InventorySupplier, { foreignKey: 'supplierId', as: 'supplier' });
InventoryPurchaseOrder.hasMany(InventoryPurchaseOrderItem, { foreignKey: 'purchaseOrderId', as: 'items', onDelete: 'CASCADE' });
InventoryPurchaseOrderItem.belongsTo(InventoryPurchaseOrder, { foreignKey: 'purchaseOrderId', as: 'purchaseOrder' });
InventoryPurchaseOrderItem.belongsTo(InventoryItem, { foreignKey: 'inventoryItemId', as: 'inventoryItem' });
InventoryRecipe.hasMany(InventoryRecipeIngredient, { foreignKey: 'recipeId', as: 'ingredients', onDelete: 'CASCADE' });
InventoryRecipeIngredient.belongsTo(InventoryRecipe, { foreignKey: 'recipeId', as: 'recipe' });
InventoryRecipeIngredient.belongsTo(InventoryItem, { foreignKey: 'inventoryItemId', as: 'inventoryItem' });

module.exports = {
  User,
  Role,
  Permission,
  RolePermission,
  UserRole,
  Restaurant,
  RestaurantMember,
  Branch,
  RestaurantTable,
  Reservation,
  TableOperationEvent,
  EmployeeBranchAssignment,
  AttendanceRecord,
  RestaurantInvitation,
  Order,
  OrderItem,
  OrderRefund,
  OrderPaymentAttempt,
  KitchenStatusHistory,
  CodCollection,
  CashHandover,
  CashHandoverItem,
  RazorpayWebhookEvent,
  DeliveryAssignment,
  DeliveryStatusHistory,
  DeliverySetting,
  DeliveryLocation,
  MenuCategory,
  FoodCategoryRequest,
  FoodCategoryRequestHistory,
  MenuItem,
  MenuItemOption,
  CustomerAddress,
  CustomerWishlistItem,
  CustomerNotification,
  CustomerNotificationPreference,
  CustomerCart,
  CustomerCartItem,
  CustomerReorderRequest,
  AuditLog,
  SubscriptionPlan,
  RestaurantSubscription,
  SubscriptionPayment,
  PlatformFoodCoupon,
  PlatformFoodCouponRedemption,
  SubscriptionCoupon,
  SubscriptionCouponRedemption,
  CommissionRule,
  CommissionRecord,
  CommissionSettlement,
  CommissionSettlementItem,
  PlatformSetting,
  RestaurantFoodCoupon,
  RestaurantFoodCouponRedemption,
  SupportTicket,
  SupportMessage,
  SupportAttachment,
  InventoryItem,
  InventoryMovement,
  InventorySupplier,
  InventoryPurchaseOrder,
  InventoryPurchaseOrderItem,
  InventoryRecipe,
  InventoryRecipeIngredient,
  PosOrderRequest,
  PosTender,
};
