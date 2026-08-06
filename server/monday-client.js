const MONDAY_API_URL = 'https://api.monday.com/v2';

const TEACHER_BOARD_ID = '5099392393';
const STUDENT_BOARD_ID = '5099392408';
const LESSON_BOARD_ID = '5101665472'; // דיווחי שעות
const REPORT_BOARD_ID = '5099392418'; // דפי חתימה

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

// --- App-specific helpers -------------------------------------------------

export async function findTeacherByEmail(email) {
  const query = `
    query GetTeacher($email: String!) {
      boards(ids: [${TEACHER_BOARD_ID}]) {
        items_page(limit: 1, query_params: { rules: [{ column_id: "email_mm4sd8r9", compare_value: [$email], operator: contains_text }] }) {
          items { id name }
        }
      }
    }
  `;
  const data = await executeGraphQL(query, { email });
  return data?.boards?.[0]?.items_page?.items?.[0] || null;
}

export async function getStudentsForTeacher(teacherId) {
  const query = `
    query GetStudents {
      boards(ids: [${STUDENT_BOARD_ID}]) {
        items_page(limit: 500) {
          items {
            id
            name
            column_values(ids: ["board_relation_mm5vrx01", "text_mm4sm7j", "text_mm4sex2s"]) {
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
  const allStudents = data?.boards?.[0]?.items_page?.items || [];

  return allStudents
    .filter((student) => {
      const relation = student.column_values?.find((c) => c.id === 'board_relation_mm5vrx01');
      const linkedIds = relation?.linked_item_ids || [];
      return linkedIds.includes(teacherId) || linkedIds.includes(String(teacherId)) || linkedIds.includes(Number(teacherId));
    })
    .map((student) => ({
      id: student.id,
      name: student.name,
      column2: student.column_values?.find((c) => c.id === 'text_mm4sm7j')?.text || '',
      column3: student.column_values?.find((c) => c.id === 'text_mm4sex2s')?.text || '',
    }));
}

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
  if (studentId) columnValues.board_relation_mm5ygvwe = { item_ids: [Number(studentId)] }; // תלמיד מקושר

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
  if (studentId) columnValues.board_relation_mm4shc40 = { item_ids: [Number(studentId)] }; // תלמיד

  const data = await executeGraphQL(mutation, {
    boardId: REPORT_BOARD_ID,
    groupId: 'group_mm4sg9rh',
    itemName: teacherName,
    columnValues: JSON.stringify(columnValues),
  });

  return data?.create_item?.id;
}

const LESSONS_REMAINING_COLUMN_ID = 'numeric_mm4s481e'; // שיעורים שנותרו, on the לקוחות board

export async function getStudentLessonsRemaining(studentId) {
  const query = `
    query GetRemaining($itemId: ID!) {
      items(ids: [$itemId]) {
        column_values(ids: ["${LESSONS_REMAINING_COLUMN_ID}"]) {
          text
        }
      }
    }
  `;
  const data = await executeGraphQL(query, { itemId: studentId });
  const text = data?.items?.[0]?.column_values?.[0]?.text;
  return text ? Number(text) : 0;
}

// Decrements "שיעורים שנותרו" by one lesson item created (call once per lesson -
// a monthly report with N lessons ends up calling this N times, single-lesson
// reports call it once).
export async function decrementStudentLessonsRemaining(studentId) {
  const current = await getStudentLessonsRemaining(studentId);
  const newValue = current - 1;

  const mutation = `
    mutation UpdateRemaining($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
      change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
        id
      }
    }
  `;
  await executeGraphQL(mutation, {
    boardId: STUDENT_BOARD_ID,
    itemId: studentId,
    columnId: LESSONS_REMAINING_COLUMN_ID,
    value: String(newValue),
  });

  return newValue;
}

export { TEACHER_BOARD_ID, STUDENT_BOARD_ID, LESSON_BOARD_ID, REPORT_BOARD_ID };
