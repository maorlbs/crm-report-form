const MONDAY_API_URL = 'https://api.monday.com/v2';

const TEACHER_BOARD_ID = '5099392393';
const CONTACT_BOARD_ID = '5099207360'; // אנשי קשר - students now live here
const LESSON_BOARD_ID = '5101665472'; // דיווחי שעות
const REPORT_BOARD_ID = '5099392418'; // דפי חתימה
const PROJECT_BOARD_ID = '5102368610'; // ניהול חבילות/פרויקטים
const PROJECT_ACTIVE_GROUP_ID = 'topics'; // חבילות/פרויקטים פעילים

// New board_relation columns (created for this integration) that link into
// the contacts board - the pre-existing relation columns on these two boards
// are hard-configured to the old "לקוחות" board (5099392408) and can't accept
// items from the contacts board.
const LESSON_CONTACT_RELATION_COLUMN_ID = 'board_relation_mm6z7dqd'; // תלמיד מקושר (אנשי קשר)
const REPORT_CONTACT_RELATION_COLUMN_ID = 'board_relation_mm6zx3mc'; // תלמיד (אנשי קשר)

const TEACHER_EMAIL_COLUMN_ID = 'email_mm4sd8r9';
const TEACHER_PHONE_COLUMN_ID = 'phone_mm4sw9yw';
const TEACHER_PASSWORD_HASH_COLUMN_ID = 'long_text_mm6z3gae';
const TEACHER_MUST_RESET_COLUMN_ID = 'boolean_mm6zdwd3';

function getToken() {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) {
    throw new Error('MONDAY_API_TOKEN is not set. Copy .env.example to .env and add your monday.com API token.');
  }
  return token;
}

export async function executeGraphQL(query, variables = {}) {
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getToken(),
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();

  if (json.errors) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }

  return json.data;
}

export async function findItemIdByName(boardId, name) {
  if (!name) return null;

  const query = `
    query FindByName($boardId: ID!, $name: String!) {
      boards(ids: [$boardId]) {
        items_page(limit: 1, query_params: { rules: [{ column_id: "name", compare_value: [$name], operator: contains_text }] }) {
          items { id name }
        }
      }
    }
  `;

  const data = await executeGraphQL(query, { boardId, name });
  return data?.boards?.[0]?.items_page?.items?.[0]?.id || null;
}

export async function getAssetPublicUrls(assetIds) {
  if (!assetIds.length) return {};

  const query = `
    query GetAssets($ids: [ID!]!) {
      assets(ids: $ids) {
        id
        public_url
      }
    }
  `;

  const data = await executeGraphQL(query, { ids: assetIds });
  const map = {};
  for (const asset of data?.assets || []) {
    map[asset.id] = asset.public_url;
  }
  return map;
}

export async function uploadFileToColumn(itemId, columnId, fileBuffer, fileName, mimeType) {
  const formData = new FormData();
  formData.append(
    'query',
    `mutation ($file: File!) {
      add_file_to_column(item_id: ${itemId}, column_id: "${columnId}", file: $file) {
        id
      }
    }`
  );
  formData.append('variables[file]', new Blob([fileBuffer], { type: mimeType }), fileName);

  const response = await fetch('https://api.monday.com/v2/file', {
    method: 'POST',
    headers: { Authorization: getToken() },
    body: formData,
  });

  return response.json();
}

// --- Teachers / auth ---------------------------------------------------

export async function findTeacherByEmail(email) {
  const query = `
    query GetTeacher($email: String!) {
      boards(ids: [${TEACHER_BOARD_ID}]) {
        items_page(limit: 1, query_params: { rules: [{ column_id: "${TEACHER_EMAIL_COLUMN_ID}", compare_value: [$email], operator: contains_text }] }) {
          items {
            id
            name
            column_values(ids: ["${TEACHER_PHONE_COLUMN_ID}", "${TEACHER_PASSWORD_HASH_COLUMN_ID}", "${TEACHER_MUST_RESET_COLUMN_ID}", "${TEACHER_EMAIL_COLUMN_ID}"]) {
              id
              text
            }
          }
        }
      }
    }
  `;
  const data = await executeGraphQL(query, { email });
  const item = data?.boards?.[0]?.items_page?.items?.[0];
  if (!item) return null;

  const col = (id) => item.column_values?.find((c) => c.id === id)?.text || '';

  return {
    id: item.id,
    name: item.name,
    email: col(TEACHER_EMAIL_COLUMN_ID),
    phone: col(TEACHER_PHONE_COLUMN_ID),
    passwordHash: col(TEACHER_PASSWORD_HASH_COLUMN_ID),
    mustResetPassword: col(TEACHER_MUST_RESET_COLUMN_ID) === 'v', // checkbox columns report "v" when checked
  };
}

export async function setTeacherPassword(teacherId, passwordHash, mustReset) {
  const mutation = `
    mutation SetPassword($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
        id
      }
    }
  `;
  await executeGraphQL(mutation, {
    boardId: TEACHER_BOARD_ID,
    itemId: teacherId,
    columnValues: JSON.stringify({
      [TEACHER_PASSWORD_HASH_COLUMN_ID]: { text: passwordHash },
      [TEACHER_MUST_RESET_COLUMN_ID]: { checked: mustReset ? 'true' : 'false' },
    }),
  });
}

export async function listAllTeachers() {
  const query = `
    query {
      boards(ids: [${TEACHER_BOARD_ID}]) {
        items_page(limit: 500) {
          items {
            id
            name
            column_values(ids: ["${TEACHER_EMAIL_COLUMN_ID}", "${TEACHER_PHONE_COLUMN_ID}", "${TEACHER_MUST_RESET_COLUMN_ID}"]) {
              id
              text
            }
          }
        }
      }
    }
  `;
  const data = await executeGraphQL(query);
  const items = data?.boards?.[0]?.items_page?.items || [];

  return items
    .map((item) => {
      const col = (id) => item.column_values?.find((c) => c.id === id)?.text || '';
      return {
        id: item.id,
        name: item.name,
        email: col(TEACHER_EMAIL_COLUMN_ID),
        phone: col(TEACHER_PHONE_COLUMN_ID),
        mustResetPassword: col(TEACHER_MUST_RESET_COLUMN_ID) === 'v',
      };
    })
    .filter((t) => t.email); // skip placeholder/blank rows with no email
}

// --- Students (אנשי קשר / contacts board) -------------------------------

export async function getStudentsForTeacher(teacherId) {
  const query = `
    query GetStudents {
      boards(ids: [${CONTACT_BOARD_ID}]) {
        items_page(limit: 500) {
          items {
            id
            name
            column_values(ids: ["board_relation_mm6zhrja", "dropdown_mm6c4teq", "dropdown_mm6c3pqq", "contact_deal"]) {
              id
              text
              ... on BoardRelationValue {
                linked_item_ids
              }
            }
          }
        }
      }
    }
  `;
  const data = await executeGraphQL(query);
  const allContacts = data?.boards?.[0]?.items_page?.items || [];

  return allContacts
    .filter((contact) => {
      const relation = contact.column_values?.find((c) => c.id === 'board_relation_mm6zhrja');
      const linkedIds = relation?.linked_item_ids || [];
      return linkedIds.includes(teacherId) || linkedIds.includes(String(teacherId)) || linkedIds.includes(Number(teacherId));
    })
    .map((contact) => ({
      id: contact.id,
      name: contact.name,
      column2: contact.column_values?.find((c) => c.id === 'dropdown_mm6c4teq')?.text || '',
      column3: contact.column_values?.find((c) => c.id === 'dropdown_mm6c3pqq')?.text || '',
    }));
}

async function getStudentDealId(studentId) {
  const query = `
    query GetDeal($itemId: ID!) {
      items(ids: [$itemId]) {
        column_values(ids: ["contact_deal"]) {
          ... on BoardRelationValue {
            linked_item_ids
          }
        }
      }
    }
  `;
  const data = await executeGraphQL(query, { itemId: studentId });
  return data?.items?.[0]?.column_values?.[0]?.linked_item_ids?.[0] || null;
}

// Finds the active package/project item (in the "חבילות/פרויקטים פעילים"
// group) linked to the same deal as this student, so a lesson report can be
// filed as a subitem under it. Returns null if no match is found - the
// project board currently has no real linked data to validate this against,
// so treat this as best-effort until it's populated.
export async function findActiveProjectItemForStudent(studentId) {
  const dealId = await getStudentDealId(studentId);
  if (!dealId) return null;

  const query = `
    query GetProjectItems {
      boards(ids: [${PROJECT_BOARD_ID}]) {
        groups(ids: ["${PROJECT_ACTIVE_GROUP_ID}"]) {
          items_page(limit: 500) {
            items {
              id
              name
              column_values(ids: ["board_relation_mm6ejnt5"]) {
                ... on BoardRelationValue {
                  linked_item_ids
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await executeGraphQL(query);
  const items = data?.boards?.[0]?.groups?.[0]?.items_page?.items || [];

  const match = items.find((item) => {
    const linkedIds = item.column_values?.[0]?.linked_item_ids || [];
    return linkedIds.includes(dealId) || linkedIds.includes(String(dealId)) || linkedIds.includes(Number(dealId));
  });

  return match?.id || null;
}

export async function createProjectSubitem(parentItemId, name) {
  const mutation = `
    mutation CreateSubitem($parentItemId: ID!, $itemName: String!) {
      create_subitem(parent_item_id: $parentItemId, item_name: $itemName) {
        id
      }
    }
  `;
  const data = await executeGraphQL(mutation, { parentItemId, itemName: name });
  return data?.create_subitem?.id;
}

// --- Lesson / report items -----------------------------------------------

function formatDateColumn(dateString) {
  return { date: dateString };
}

export async function createLessonItem({ studentId, studentName, teacherName, date, startHour, startMinute, endHour, endMinute }) {
  const mutation = `
    mutation CreateLesson($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
        id
      }
    }
  `;

  const columnValues = {
    date_mm5y2ekf: formatDateColumn(date), // תאריך שיעור
    hour_mm5y68a6: { hour: startHour, minute: startMinute }, // שעת התחלה
    hour_mm5ye9ek: { hour: endHour, minute: endMinute }, // שעת סיום
    text_mm5yfq79: teacherName, // שם המורה
  };
  if (studentId) columnValues[LESSON_CONTACT_RELATION_COLUMN_ID] = { item_ids: [Number(studentId)] };

  const data = await executeGraphQL(mutation, {
    boardId: LESSON_BOARD_ID,
    itemName: studentName,
    columnValues: JSON.stringify(columnValues),
  });

  return data?.create_item?.id;
}

export async function createReportItem({ studentName, teacherName, teacherId, studentId, totalHours }) {
  const mutation = `
    mutation CreateReport($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName, column_values: $columnValues) {
        id
      }
    }
  `;

  const today = new Date();
  const todayFormatted = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const columnValues = {
    text_mm4s2er2: studentName, // שם התלמיד
    numeric_mm4sy518: totalHours, // סה"כ שעות
    date_mm5yatqr: { date: todayFormatted }, // תאריך
  };
  if (teacherId) columnValues.board_relation_mm4sv07c = { item_ids: [Number(teacherId)] }; // מורה
  if (studentId) columnValues[REPORT_CONTACT_RELATION_COLUMN_ID] = { item_ids: [Number(studentId)] };

  const data = await executeGraphQL(mutation, {
    boardId: REPORT_BOARD_ID,
    groupId: 'group_mm4sg9rh',
    itemName: teacherName,
    columnValues: JSON.stringify(columnValues),
  });

  return data?.create_item?.id;
}

export {
  TEACHER_BOARD_ID,
  CONTACT_BOARD_ID,
  LESSON_BOARD_ID,
  REPORT_BOARD_ID,
  PROJECT_BOARD_ID,
};
