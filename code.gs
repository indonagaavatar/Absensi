const DB_NAME = "Database_Sistem_Absensi_SMP_WerguWetan";

function doGet(e) {
  setupDatabase(); 
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Sistem Absensi Siswa')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
}

function setupDatabase() {
  var props = PropertiesService.getScriptProperties();
  var dbId = props.getProperty('DB_ID');
  
  if (!dbId) {
    var ss = SpreadsheetApp.create(DB_NAME);
    
    var sheetSiswa = ss.getActiveSheet();
    sheetSiswa.setName("Data_Siswa");
    sheetSiswa.appendRow(["NIS", "Nama Lengkap", "Kelas", "PIN", "QR Code"]);
    tambahSiswaDb(sheetSiswa, "1001", "Ahmad Maulana", "7");
    tambahSiswaDb(sheetSiswa, "1002", "Siti Aisyah", "8");
    tambahSiswaDb(sheetSiswa, "1003", "Budi Santoso", "9");
    
    var sheetAbsen = ss.insertSheet("Absensi_Harian");
    sheetAbsen.appendRow(["Waktu", "Tanggal", "NIS", "Nama", "Kelas", "Status"]);

    props.setProperty('DB_ID', ss.getId());
    props.setProperty('MASTER_PIN', "180616"); // Set PIN Default Saat Install Pertama Kali
  }
}

// =======================================================
// FITUR KEAMANAN MASTER PIN (BARU)
// =======================================================
function getMasterPin() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty('MASTER_PIN') || "180616"; // Jika kosong, kembalikan ke default
}

function gantiMasterPin(pinLama, pinBaru) {
  var currentPin = getMasterPin();
  if(currentPin !== pinLama) {
    return { success: false, msg: "Gagal: Master PIN Lama yang Anda masukkan salah!" };
  }
  
  PropertiesService.getScriptProperties().setProperty('MASTER_PIN', pinBaru);
  return { success: true, msg: "Berhasil! Master PIN telah diperbarui ke dalam sistem." };
}

// =======================================================

function tambahSiswaDb(sheet, nis, nama, kelas) {
  var pin = Math.floor(1000 + Math.random() * 9000).toString();
  var qrFormula = '=IMAGE("https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=" & A' + (sheet.getLastRow() + 1) + ')';
  sheet.appendRow([nis, nama, kelas, pin, qrFormula]);
}

function getTodayString() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy"); }
function formatDateFromSheet(val) {
  if (!val) return "";
  if (val instanceof Date) { return Utilities.formatDate(val, Session.getScriptTimeZone(), "dd/MM/yyyy"); }
  return val.toString();
}

function checkAndRunAutoAlpha() {
  var props = PropertiesService.getScriptProperties();
  var waktu = new Date(); var tanggal = getTodayString(); var jam = waktu.getHours();
  var keyAlphaRan = 'alpha_ran_' + tanggal;
  
  if (jam >= 10 && props.getProperty(keyAlphaRan) !== 'true') {
    var id = props.getProperty('DB_ID'); var ss = SpreadsheetApp.openById(id);
    var sheetSiswa = ss.getSheetByName("Data_Siswa"); var sheetAbsen = ss.getSheetByName("Absensi_Harian");
    var dataSiswa = sheetSiswa.getDataRange().getValues(); dataSiswa.shift();
    var dataAbsen = sheetAbsen.getDataRange().getValues(); dataAbsen.shift();
    var absenHariIni = dataAbsen.filter(row => formatDateFromSheet(row[1]) === tanggal).map(row => row[2].toString());

    dataSiswa.forEach(siswa => {
      var nis = siswa[0].toString();
      if(absenHariIni.indexOf(nis) === -1) { sheetAbsen.appendRow([waktu, tanggal, nis, siswa[1], siswa[2], 'Alpha']); }
    });
    props.setProperty(keyAlphaRan, 'true');
  }
}

function validasiIdentitasAbsen(inputData) {
  if(inputData.type === 'pin' && inputData.pin === getMasterPin()) return { role: 'master' };
  
  var id = PropertiesService.getScriptProperties().getProperty('DB_ID');
  var dataSiswa = SpreadsheetApp.openById(id).getSheetByName("Data_Siswa").getDataRange().getValues();
  for(var i=1; i<dataSiswa.length; i++) {
    if((inputData.type === 'qr' && dataSiswa[i][0].toString() === inputData.data.toString()) || 
       (inputData.type === 'pin' && dataSiswa[i][3].toString() === inputData.pin.toString())) {
      return { role: 'student', nis: dataSiswa[i][0], nama: dataSiswa[i][1], kelas: dataSiswa[i][2] };
    }
  }
  return { role: 'not_found' };
}

function simpanAbsenFinal(nis, nama, kelas, status, isMasterMode) {
  var id = PropertiesService.getScriptProperties().getProperty('DB_ID');
  var sheetAbsen = SpreadsheetApp.openById(id).getSheetByName("Absensi_Harian");
  var dataAbsen = sheetAbsen.getDataRange().getValues();
  var waktu = new Date(); var jam = waktu.getHours(); var tanggal = getTodayString(); 
  
  for(var i=1; i<dataAbsen.length; i++) {
    if(formatDateFromSheet(dataAbsen[i][1]) === tanggal && dataAbsen[i][2].toString() === nis.toString()) {
      return { success: false, msg: 'GAGAL: Siswa ini sudah diabsen hari ini! Data yang sudah tersimpan tidak dapat diubah.' };
    }
  }

  if(!isMasterMode) { if(jam < 6 || jam >= 10) return { success: false, msg: 'Waktu absen mandiri hanya dari jam 06:00 sampai 10:00.' }; }
  
  sheetAbsen.appendRow([waktu, tanggal, nis, nama, kelas, status]);
  return { success: true, msg: 'Berhasil! Kehadiran telah dicatat.' };
}

function getDashboardStats() {
  checkAndRunAutoAlpha(); 
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DB_ID'));
  var dataSiswa = ss.getSheetByName("Data_Siswa").getDataRange().getValues(); dataSiswa.shift();
  var dataAbsen = ss.getSheetByName("Absensi_Harian").getDataRange().getValues(); dataAbsen.shift();
  
  var totalSiswa = dataSiswa.length, kelasCount = {};
  dataSiswa.forEach(r => { if(r[2]) kelasCount[r[2]] = (kelasCount[r[2]] || 0) + 1; });
  var kelasData = Object.keys(kelasCount).map(k => ({ kelas: k, jumlah: kelasCount[k] })).sort((a,b) => a.kelas.localeCompare(b.kelas));
  
  var today = getTodayString(); var hadir = 0, sakitIzin = 0, alpha = 0; var nisTercatatHariIni = {};
  for(var i = dataAbsen.length - 1; i >= 0; i--) {
    var r = dataAbsen[i];
    if(formatDateFromSheet(r[1]) === today) {
      var nis = r[2].toString();
      if(!nisTercatatHariIni[nis]) {
        nisTercatatHariIni[nis] = true;
        if(r[5] === 'Hadir') hadir++; else if(r[5] === 'Sakit' || r[5] === 'Izin') sakitIzin++; else if(r[5] === 'Alpha') alpha++;
      }
    }
  }
  var belumAbsen = Math.max(0, totalSiswa - (hadir + sakitIzin + alpha));
  
  // Kirim Master PIN saat ini ke UI (untuk validasi responsif di frontend)
  var currentPin = getMasterPin();
  
  return { totalSiswa, hadir, sakitIzin, alpha, belumAbsen, kelasData, currentPin };
}

function getRiwayatAbsenSiswa(nis) {
  var id = PropertiesService.getScriptProperties().getProperty('DB_ID');
  var sheet = SpreadsheetApp.openById(id).getSheetByName("Absensi_Harian");
  var data = sheet.getDataRange().getValues(); data.shift(); 
  var history = [];
  for(var i=0; i<data.length; i++) {
    if(data[i][2].toString() === nis.toString()) {
      history.push({ tanggal: formatDateFromSheet(data[i][1]), waktu: new Date(data[i][0]).toLocaleTimeString('id-ID'), status: data[i][5], rawTime: new Date(data[i][0]).getTime() });
    }
  }
  history.sort(function(a, b){ return b.rawTime - a.rawTime }); return history;
}

function getMasterData() {
  var id = PropertiesService.getScriptProperties().getProperty('DB_ID'); var ss = SpreadsheetApp.openById(id);
  var sheetKelas = ss.getSheetByName("Data_Kelas");
  if(!sheetKelas) {
    sheetKelas = ss.insertSheet("Data_Kelas"); sheetKelas.appendRow(["Nama Kelas"]);
    sheetKelas.appendRow(["7"]); sheetKelas.appendRow(["8"]); sheetKelas.appendRow(["9"]);
  }
  var dataSiswa = ss.getSheetByName("Data_Siswa").getDataRange().getValues(); dataSiswa.shift(); 
  var dataKelasRaw = sheetKelas.getDataRange().getValues(); dataKelasRaw.shift();
  var dataKelas = dataKelasRaw.map(r => r[0].toString()).filter(k => k.trim() !== "");
  return { siswa: dataSiswa, kelas: dataKelas };
}

function tambahKelasMaster(kelasBaru) {
  var sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DB_ID')).getSheetByName("Data_Kelas");
  var data = sheet.getDataRange().getValues();
  for(var i=1; i<data.length; i++) { if(data[i][0].toString() === kelasBaru) return { status: 'error', message: 'Kategori Kelas ini sudah ada!' }; }
  sheet.appendRow([kelasBaru]); return { status: 'success' };
}
function hapusKelasMaster(kelas) {
  var sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DB_ID')).getSheetByName("Data_Kelas");
  var data = sheet.getDataRange().getValues();
  for(var i=1; i<data.length; i++) { if(data[i][0].toString() === kelas.toString()) { sheet.deleteRow(i + 1); return { status: 'success' }; } }
  return { status: 'error', message: 'Kelas tidak ditemukan.' };
}
function editKelasMaster(kelasLama, kelasBaru) {
  var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DB_ID'));
  var sheetKelas = ss.getSheetByName("Data_Kelas"); var dataK = sheetKelas.getDataRange().getValues();
  for(var i=1; i<dataK.length; i++) { if(dataK[i][0].toString() === kelasLama.toString()) { sheetKelas.getRange(i+1, 1).setValue(kelasBaru); } }
  var sheetSiswa = ss.getSheetByName("Data_Siswa"); var dataS = sheetSiswa.getDataRange().getValues();
  for(var j=1; j<dataS.length; j++) { if(dataS[j][2].toString() === kelasLama.toString()) { sheetSiswa.getRange(j+1, 3).setValue(kelasBaru); } }
  return { status: 'success' };
}

function tambahSiswa(formData) {
  try {
    var sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DB_ID')).getSheetByName("Data_Siswa");
    var data = sheet.getDataRange().getValues();
    for(var i=1; i<data.length; i++) { if(data[i][0].toString() === formData.nis) return { status: 'error', message: 'NIS terdaftar!' }; }
    tambahSiswaDb(sheet, formData.nis, formData.nama, formData.kelas); return { status: 'success' };
  } catch(e) { return { status: 'error', message: e.toString() }; }
}

function hapusSiswa(nis) {
  var sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DB_ID')).getSheetByName("Data_Siswa");
  var data = sheet.getDataRange().getValues();
  for(var i=1; i<data.length; i++) { if(data[i][0].toString() === nis.toString()) { sheet.deleteRow(i + 1); return { status: 'success' }; } }
}
function hapusSiswaPerKelas(kelas) {
  var sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DB_ID')).getSheetByName("Data_Siswa");
  var data = sheet.getDataRange().getValues();
  for(var i = data.length - 1; i >= 1; i--) { if(data[i][2].toString() === kelas.toString()) { sheet.deleteRow(i + 1); } } return { status: 'success' };
}
function pindahSiswaSatu(nis, kelasBaru) {
  var sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DB_ID')).getSheetByName("Data_Siswa");
  var data = sheet.getDataRange().getValues();
  for(var i = 1; i < data.length; i++) { if(data[i][0].toString() === nis.toString()) { sheet.getRange(i + 1, 3).setValue(kelasBaru); return { status: 'success' }; } }
  return { status: 'error', message: 'Siswa tidak ditemukan.' };
}
function pindahSiswaPerKelas(kelasLama, kelasBaru) {
  var sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DB_ID')).getSheetByName("Data_Siswa");
  var data = sheet.getDataRange().getValues();
  for(var i = 1; i < data.length; i++) { if(data[i][2].toString() === kelasLama.toString()) { sheet.getRange(i + 1, 3).setValue(kelasBaru); } }
  return { status: 'success' };
}

function getRekapKehadiranHariIni() {
  var dataAbsen = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DB_ID')).getSheetByName("Absensi_Harian").getDataRange().getValues();
  dataAbsen.shift(); var result = {}, today = getTodayString(); var nisTercatat = {};
  for(var i = dataAbsen.length - 1; i >= 0; i--) {
    var row = dataAbsen[i];
    if(formatDateFromSheet(row[1]) === today) {
      var nis = row[2].toString();
      if(!nisTercatat[nis]) { nisTercatat[nis] = true; var kls = row[4]; if(!result[kls]) result[kls] = []; result[kls].push({ waktu: new Date(row[0]).toLocaleTimeString('id-ID'), nis: row[2], nama: row[3], status: row[5] }); }
    }
  } return result; 
}
function getAllDatabaseInternal() {
  var id = PropertiesService.getScriptProperties().getProperty('DB_ID'); var data = SpreadsheetApp.openById(id).getSheetByName("Absensi_Harian").getDataRange().getValues();
  var result = {};
  for(var i=1; i<data.length; i++) {
    var kls = data[i][4]; if(!result[kls]) result[kls] = [];
    result[kls].push({ tanggal: formatDateFromSheet(data[i][1]), waktu: new Date(data[i][0]).toLocaleTimeString('id-ID'), nis: data[i][2], nama: data[i][3], status: data[i][5] });
  } return result;
}
function hapusDataAbsenSatu(nis, tanggal) {
  var id = PropertiesService.getScriptProperties().getProperty('DB_ID'); var sheet = SpreadsheetApp.openById(id).getSheetByName("Absensi_Harian"); var data = sheet.getDataRange().getValues();
  for(var i = data.length - 1; i >= 1; i--) { if(data[i][2].toString() === nis.toString() && formatDateFromSheet(data[i][1]) === tanggal) { sheet.deleteRow(i + 1); return { success: true }; } }
  return { success: false, msg: "Data tidak ditemukan." };
}
function hapusSemuaAbsen() {
  var sheet = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('DB_ID')).getSheetByName("Absensi_Harian"); var lastRow = sheet.getLastRow();
  if(lastRow > 1) { sheet.getRange(2, 1, lastRow - 1, 6).clearContent(); } return { success: true };
}
