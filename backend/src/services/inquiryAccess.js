function getInquiryScope(user) {
  if (user?.role === "ADMIN") return { clause: "", values: [] };
  if (user?.role === "INTAKE") return { clause: "i.created_by = $1", values: [user.id] };
  if (user?.role === "HANDLER") return { clause: "i.assigned_to = $1", values: [user.id] };
  return null;
}

function canAccessInquiry(user, inquiry) {
  if (user?.role === "ADMIN") return true;
  if (user?.role === "INTAKE") return Number(inquiry.created_by) === Number(user.id);
  if (user?.role === "HANDLER") return Number(inquiry.assigned_to) === Number(user.id);
  return false;
}

module.exports = { getInquiryScope, canAccessInquiry };
