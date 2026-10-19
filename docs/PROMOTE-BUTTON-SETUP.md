# Promote button — tick a Pending row, send it to Master (≈3 min)

Adds an **IG Directory → Promote ticked rows** menu to your sheet. You tick the rows you've
curated in Pending, click the menu, and they're copied into your Master tab in the right format
(handle turned into a full IG URL; name / type / discipline / category carried across). Deduped,
non-destructive — promoted rows stay in Pending marked green so nothing is lost.

## 1. Add two columns to the Pending tab

- In **K1**, type `Promote`. Select **K2:K** (down to your last row), then **Insert → Checkbox**.
- In **L1**, type `Promoted` (leave the cells blank — the script fills this in).

## 2. Add the script

1. **Extensions → Apps Script** (same project as your capture `doPost`).
2. Paste these functions **below** your existing `doPost` — don't remove anything that's there.
   Set `MASTER_TAB` to the exact name of your curated directory tab if it isn't "Master".

```javascript
var MASTER_TAB  = 'Master';    // ← your curated directory tab name
var PENDING_TAB = 'Pending';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('IG Directory')
    .addItem('Promote ticked rows → Master', 'promoteTicked')
    .addToUi();
}

function promoteTicked() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var pend = ss.getSheetByName(PENDING_TAB);
  var mast = ss.getSheetByName(MASTER_TAB);
  var ui = SpreadsheetApp.getUi();
  if (!pend || !mast) { ui.alert('Need both a "' + PENDING_TAB + '" and a "' + MASTER_TAB + '" tab.'); return; }
  if (pend.getLastRow() < 2) { ui.alert('Nothing in Pending yet.'); return; }

  // Pending columns: A at | B handle | C name | D followers | E benchmarkType
  //                  F type | G discipline | H category | I confidence | J source
  //                  K Promote (checkbox) | L Promoted (status)
  var data = pend.getRange(2, 1, pend.getLastRow() - 1, 12).getValues();

  // Existing Master handles, for de-dupe.
  var have = {};
  if (mast.getLastRow() > 1) {
    mast.getRange(2, 1, mast.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var h = _handle(r[0]);
      if (h) have[h] = true;
    });
  }

  var promoted = 0, skipped = 0;
  for (var i = 0; i < data.length; i++) {
    var row = data[i], r = i + 2;
    if (row[10] !== true || row[11]) continue;              // not ticked, or already promoted
    var handle = _handle(row[1]);
    if (!handle) continue;
    if (have[handle]) {                                     // already curated
      pend.getRange(r, 11).setValue(false);
      pend.getRange(r, 12).setValue('already in Master');
      skipped++;
      continue;
    }
    mast.appendRow(['https://www.instagram.com/' + handle, row[2] || '',
                    row[5] || '', row[6] || '', row[7] || '']);  // URL, name, type, disc, cat
    have[handle] = true;
    pend.getRange(r, 11).setValue(false);
    pend.getRange(r, 12).setValue('promoted ' + new Date().toISOString().slice(0, 10));
    pend.getRange(r, 1, 1, 12).setBackground('#e6f4ea');
    promoted++;
  }
  ss.toast(promoted + ' promoted to Master, ' + skipped + ' already there.', 'IG Directory', 6);
}

function _handle(v) {
  return String(v || '').toLowerCase().trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .replace(/[\/?].*$/, '').replace(/^@/, '').trim();
}
```

3. **Save** (disk icon). No re-deploy needed — menus run on the bound sheet directly.
4. Reload the spreadsheet tab. An **IG Directory** menu appears next to Help.

## How to use it

1. In Pending, fix `type / discipline / category` on the rows you want (the dropdowns keep them valid).
2. Tick the **Promote** checkbox on those rows.
3. **IG Directory → Promote ticked rows → Master.** First run asks you to authorise (it's your script).
4. Promoted rows turn green and get a "promoted <date>" stamp; the new rows appear in Master.
5. They go live at the next weekly rebuild (or whenever you next run `vercel --prod`).

**Notes**
- Non-destructive: promoted rows stay in Pending (green) so nothing is deleted. Clear them out whenever you like.
- Deduped: a handle already in Master is skipped and marked "already in Master".
- `benchmarkType` isn't copied — Master derives brand-vs-creator from the **type** column, so just make sure `type` is right (Brand / Athlete / Creator).
