/*
 * تطبيق منشئ الجدول الدراسي الذكي
 * يحمل البيانات من ملف JSON، يتيح اختيار المقررات والتفضيلات، ثم يولد جدولاً مثالياً.
 */

// سيحمل dataset لاحقًا من عنصر script في index.html

document.addEventListener('DOMContentLoaded', () => {
  const genderSelect = document.getElementById('gender');
  const levelSelect = document.getElementById('level');
  const coursesSection = document.getElementById('courses-section');
  const coursesList = document.getElementById('courses-list');
  const preferencesSection = document.getElementById('preferences-section');
  const buildBtn = document.getElementById('build-btn');
  const resultsSection = document.getElementById('results-section');
  const scheduleOutput = document.getElementById('schedule-output');
  const alternativesDiv = document.getElementById('alternatives');

  // سيتم تحميل البيانات من المتغير العالمي
  let dataset = window.SCHEDULE_DATA || null;
  let selectedCourses = new Set();

  // إذا كانت البيانات متوفرة، قم بتهيئة المقررات. البيانات تأتي من schedule_data.js
  if (dataset) {
    updateCourses();
  } else {
    console.error('لم يتم تحميل بيانات الجدول.');
  }

  genderSelect.addEventListener('change', () => {
    updateCourses();
  });
  levelSelect.addEventListener('change', () => {
    updateCourses();
  });

  // تحديث قائمة المقررات بناءً على الجنس والمستوى
  function updateCourses() {
    selectedCourses.clear();
    coursesList.innerHTML = '';
    scheduleOutput.innerHTML = '';
    alternativesDiv.innerHTML = '';
    resultsSection.classList.add('hidden');
    preferencesSection.classList.add('hidden');
    buildBtn.classList.add('hidden');
    if (!dataset) return;
    const gender = genderSelect.value;
    const level = levelSelect.value;
    const sections = dataset[gender][level];
    // استخراج المقررات الفريدة
    const courseNames = Array.from(new Set(sections.map((s) => s.course))).sort();
    courseNames.forEach((course) => {
      const div = document.createElement('div');
      div.className = 'course-item';
      div.textContent = course;
      div.addEventListener('click', () => {
        if (div.classList.contains('selected')) {
          div.classList.remove('selected');
          selectedCourses.delete(course);
        } else {
          div.classList.add('selected');
          selectedCourses.add(course);
        }
        // إظهار التفضيلات وزر البناء إذا وُجد على الأقل مقرر واحد
        if (selectedCourses.size > 0) {
          preferencesSection.classList.remove('hidden');
          buildBtn.classList.remove('hidden');
        } else {
          preferencesSection.classList.add('hidden');
          buildBtn.classList.add('hidden');
        }
      });
      coursesList.appendChild(div);
    });
    coursesSection.classList.remove('hidden');
  }

  // تحويل رقم اليوم إلى اسم عربي
  function dayName(day) {
    const names = {
      1: 'الأحد',
      2: 'الإثنين',
      3: 'الثلاثاء',
      4: 'الأربعاء',
      5: 'الخميس',
    };
    return names[day] || `اليوم ${day}`;
  }

  // عرض جدول في HTML
  function renderSchedule(schedule, container, title) {
    if (!schedule || schedule.length === 0) {
      const p = document.createElement('p');
      p.textContent = 'لا يوجد جدول مناسب.';
      container.appendChild(p);
      return;
    }
    const heading = document.createElement('h3');
    heading.textContent = title;
    container.appendChild(heading);
    const table = document.createElement('table');
    table.className = 'schedule-table';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['المقرر', 'اليوم', 'الوقت', 'الأستاذ/الأستاذة', 'الشعبة'].forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    schedule.forEach((s) => {
      const tr = document.createElement('tr');
      const cells = [
        s.course,
        dayName(s.day),
        minutesToTime(s.start) + ' - ' + minutesToTime(s.end),
        s.instructor || '-',
        s.section || '-',
      ];
      cells.forEach((c) => {
        const td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  // تحويل الدقائق إلى HH:MM
  function minutesToTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const pad = (x) => (x < 10 ? '0' + x : x);
    // إذا كان الوقت قبل الثامنة صباحاً، نفترض أنه في الفترة المسائية ونضيف 12 ساعة
    let displayHour = h;
    if (h < 8) {
      displayHour = h + 12;
    }
    return `${pad(displayHour)}:${pad(m)}`;
  }

  // الحساب الأساسي للجدول الأفضل
  function generateSchedule(sections, selected, preferences) {
    // sections: list of all sections objects for current gender & level
    // selected: Set of course names
    // group options by course
    const courseList = Array.from(selected);
    const optionsByCourse = {};
    courseList.forEach((course) => {
      optionsByCourse[course] = sections.filter((s) => s.course === course);
    });
    let bestSchedules = []; // array of {schedule, score}

    function backtrack(index, current) {
      if (index === courseList.length) {
        const res = evaluateSchedule(current, preferences);
        if (res.conflicts === 0) {
          // insert into bestSchedules sorted by score desc
          bestSchedules.push({ schedule: current.slice(), score: res.score, gaps: res.gaps });
          bestSchedules.sort((a, b) => b.score - a.score);
          // keep only top 3
          if (bestSchedules.length > 3) bestSchedules.pop();
        }
        return;
      }
      const course = courseList[index];
      for (const option of optionsByCourse[course]) {
        // early pruning: check conflict with current
        let conflict = false;
        for (const c of current) {
          if (c.day === option.day && !(option.end <= c.start || option.start >= c.end)) {
            conflict = true;
            break;
          }
        }
        if (conflict) continue;
        current.push(option);
        backtrack(index + 1, current);
        current.pop();
      }
    }
    backtrack(0, []);
    return bestSchedules;
  }

  // تقييم جدول بناءً على التفضيلات
  function evaluateSchedule(schedule, preferences) {
    let conflicts = 0;
    let score = 0;
    let totalGaps = 0;
    // التفضيلات
    const timePref = preferences.timePref; // 'morning', 'evening', 'both'
    const avoidDays = preferences.avoidDays || [];
    // حساب درجة الوقت المفضل وتجنب الأيام
    schedule.forEach((s) => {
      // الوقت المفضل
      const isMorning = s.start < 12 * 60; // قبل 12 ظهراً
      if (timePref === 'morning' && isMorning) score += 5;
      else if (timePref === 'evening' && !isMorning) score += 5;
      // تجنب الأيام
      if (avoidDays.includes(s.day.toString())) score -= 3;
    });
    // حساب الفجوات لكل يوم
    const byDay = {};
    schedule.forEach((s) => {
      if (!byDay[s.day]) byDay[s.day] = [];
      byDay[s.day].push(s);
    });
    Object.values(byDay).forEach((list) => {
      // فرز حسب الوقت
      list.sort((a, b) => a.start - b.start);
      for (let i = 0; i < list.length - 1; i++) {
        const gap = list[i + 1].start - list[i].end;
        if (gap > 0) {
          totalGaps += gap;
        } else {
          conflicts++;
        }
      }
    });
    // تقليل الفجوات يزيد من الدرجة
    score -= totalGaps / 30; // كل نصف ساعة فجوة يقلل نقطة
    return { score, conflicts, gaps: totalGaps };
  }

  // عند الضغط على زر بناء الجدول
  buildBtn.addEventListener('click', () => {
    if (!dataset) return;
    if (selectedCourses.size === 0) {
      alert('اختر المقررات أولاً');
      return;
    }
    const gender = genderSelect.value;
    const level = levelSelect.value;
    const sections = dataset[gender][level];
    const timePref = document.getElementById('timePref').value;
    const avoidDays = Array.from(
      preferencesSection.querySelectorAll('.days-list input[type="checkbox"]:checked'),
    ).map((cb) => cb.value);
    const preferences = { timePref, avoidDays };
    const best = generateSchedule(sections, selectedCourses, preferences);
    scheduleOutput.innerHTML = '';
    alternativesDiv.innerHTML = '';
    if (best.length === 0) {
      scheduleOutput.textContent = 'لم يتم العثور على جدول بدون تعارضات لهذه الاختيارات.';
    } else {
      // العرض الأفضل
      renderSchedule(best[0].schedule, scheduleOutput, 'أفضل جدول');
      // البدائل
      if (best.length > 1) {
        const altTitle = document.createElement('h3');
        altTitle.textContent = 'بدائل أخرى';
        alternativesDiv.appendChild(altTitle);
        for (let i = 1; i < best.length; i++) {
          const container = document.createElement('div');
          container.className = 'alt-schedule';
          renderSchedule(best[i].schedule, container, 'بديل ' + i);
          alternativesDiv.appendChild(container);
        }
      }
    }
    resultsSection.classList.remove('hidden');
  });
});