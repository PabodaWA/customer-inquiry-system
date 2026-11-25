import CategoriesClient from "./CategoriesClient";

// Category data loads in a client effect, so opt this segment out of
// instant-navigation validation.
export const instant = false;

export default function CategoryManagementPage() {
  return <CategoriesClient />;
}
