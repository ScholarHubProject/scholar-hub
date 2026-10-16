// The kinds of scholarship the office runs. The admin picks one when posting a
// scholarship, and students filter the available list by it.
export const SCHOLARSHIP_CATEGORIES = ["TDP", "Barangay Scholar", "LGU Scholar"];

// Scholarships posted before the category field existed have none stored, so
// their title and code are read for the program name instead. Returns "" when
// nothing matches.
export const getScholarshipCategory = (scholarship) => {
  if (SCHOLARSHIP_CATEGORIES.includes(scholarship?.category)) {
    return scholarship.category;
  }

  const text = `${scholarship?.scholarship_code || ""} ${scholarship?.title || ""}`.toLowerCase();

  if (/\btdp\b|tulong dunong/.test(text)) return "TDP";
  if (/barangay|\bbrgy\b/.test(text)) return "Barangay Scholar";
  if (/\blgu\b|local government|municipal|city scholar/.test(text)) return "LGU Scholar";
  return "";
};
