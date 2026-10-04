/**
 * Arayüz metinleri: `[Türkçe, English]`.
 *
 * Anahtar biçimi `alan.ad`. `{ad}` yer tutucuları `t(key, { ad: … })` ile
 * dolduruluyor. Sayılı ifadeler `.one` / `.other` çiftiyle tanımlı — bkz.
 * `i18n.ts` içindeki `tp()`.
 *
 * Yeni metin eklerken iki dili birlikte yazın: `as const satisfies` tek dilli
 * girdiyi derlemede yakalıyor.
 */
export const MESSAGES = {
  // ------------------------------------------------------------ genel/ortak
  "theme.nterminalDark": ["N-Terminal Koyu", "N-Terminal Dark"],
  "theme.windowsTerminal": ["Windows Terminal", "Windows Terminal"],
  "theme.oneHalfDark": ["One Half Koyu", "One Half Dark"],
  "theme.solarizedLight": ["Solarized Açık", "Solarized Light"],

  "store.settingsReset": [
    "Ayarlar varsayılanlara döndürüldü",
    "Settings restored to defaults",
  ],
  "store.lastGroup": ["En az bir grup kalmalı", "At least one group must remain"],
  "store.groupHasLocked": [
    "Bu grupta {n} kilitli sekme var — önce kilitlerini kaldırın",
    "This group has {n} locked tabs — unlock them first",
  ],
  "store.favoriteGroupAdded": ["Favori gruplara eklendi", "Added to favorite groups"],
  "store.favoriteGroupRemoved": ["Favori gruptan çıkarıldı", "Removed from favorite groups"],
  "store.noProfiles": [
    "Tanımlı kabuk profili yok — Ayarlar › Profiller",
    "No shell profile defined — Settings › Profiles",
  ],
  "store.tabLocked": [
    "Sekme kilitli — kapatmak için kilidi kaldırın",
    "The tab is locked — unlock it to close",
  ],
  "store.tabLockedCwd": [
    "Sekme kilitli — klasör değiştirmek için kilidi kaldırın",
    "The tab is locked — unlock it to change directory",
  ],
  "store.tabLockedOn": [
    "Sekme kilitlendi — klasör de sabit",
    "Tab locked — the directory is fixed too",
  ],
  "store.tabLockedOff": ["Sekme kilidi kaldırıldı", "Tab unlocked"],
  "store.skippedLocked.one": [
    "{n} kilitli sekme kapatılmadı",
    "{n} locked tab was not closed",
  ],
  "store.skippedLocked.other": [
    "{n} kilitli sekme kapatılmadı",
    "{n} locked tabs were not closed",
  ],
  "store.favoriteRemoved": ["Favoriden kaldırıldı", "Removed from favorites"],
  "store.favoriteAdded": ["Favorilere eklendi", "Added to favorites"],
  "store.noActiveTerminal": ["Etkin bir terminal yok", "No active terminal"],
  "group.newName": ["Grup {n}", "Group {n}"],

  "common.close": ["Kapat", "Close"],
  "common.loading": ["Yükleniyor…", "Loading…"],
  // Yol kopyalandı bildirimi İKİ yerden geliyor: değişiklik listesindeki dosya
  // satırı ve komut şeridindeki dizin rozeti. Aynı metnin iki anahtarı olması,
  // birini değiştirip ötekini unutmanın yolu.
  "common.pathCopied": ["Yol kopyalandı", "Path copied"],
  "dirs.search": ["Klasör ara…", "Search directories…"],
  "files.search": ["Bu dizinde dosya ara…", "Search files in this directory…"],
  "app.searchFiles": ["Dosya ara", "Search files"],
  "app.searchTitle": [
    "Bulunduğun dizinde dosya ara ({keys})",
    "Search files in the current directory ({keys})",
  ],
  "files.empty": ["Eşleşen dosya yok", "No matching files"],
  "files.hint": [
    "Enter dosyayı açar · Shift+Enter yolunu komut satırına ekler",
    "Enter opens the file · Shift+Enter appends its path to the command line",
  ],
  "action.filePalette": ["Dosya ara", "Search files"],
  "dirs.parent": ["Üst klasör", "Parent directory"],
  "dirs.empty": ["Alt klasör yok", "No subdirectories"],
  "dirs.open": ["Klasör değiştir", "Change directory"],
  "dirs.copyPath": ["Klasör yolunu kopyala", "Copy folder path"],
  "dirs.lockedTitle": [
    "Sekme kilitli — klasör sabit",
    "The tab is locked — the directory is fixed",
  ],
  "app.changes": ["Değişiklikler", "Changes"],
  "app.files": ["Dosyalar", "Files"],
  "app.filesTitle": [
    "Bulunduğun dizinin dosya ağacı",
    "File tree of the current directory",
  ],
  "app.filesCloseTitle": ["Dosya ağacını kapat", "Close the file tree"],
  "app.sidebarHide": ["Grupları daralt", "Collapse groups"],
  "app.sidebarShow": ["Grupları göster", "Show groups"],
  "tree.noDir": ["Dizin bilinmiyor", "Directory unknown"],
  "tree.empty": ["Boş klasör", "Empty folder"],
  // Dosya sütununun kendi arama kutusu. Ağaç tembel yüklendiği için arama
  // ağacı süzmüyor, düz bir eşleşme listesi gösteriyor (bkz. `FileSearch`).
  "tree.searchPlaceholder": ["Dosyalarda ara…", "Search files…"],
  "tree.noMatch": ["Eşleşen dosya yok", "No matching files"],
  // Arama kutusu başlıktaki düğmeyle açılıyor; sürekli yer kaplamıyor.
  "tree.searchOpen": ["Dosyalarda ara", "Search files"],
  "tree.searchClose": ["Aramayı kapat", "Close search"],
  // Toplu katlama. "Tümünü genişlet" YOK ve olamaz: ağaç tembel yüklendiği
  // için "tümü" tüm dizin ağacını diskten yürümek demek. İkinci durum bu
  // yüzden "geri aç" — daraltmadan önce açık olanları geri getiriyor.
  "tree.collapseAll": ["Tüm klasörleri daralt", "Collapse all folders"],
  "tree.reopen": ["Klasörleri geri aç", "Reopen folders"],
  "viewer.back": ["Ağaca dön", "Back to tree"],
  "viewer.unsaved": ["Kaydedilmemiş değişiklikler var", "Unsaved changes"],
  "viewer.cannotEdit": [
    "Bu dosya burada düzenlenemiyor: ikili, yarım megabayttan büyük ya da satır sonları karışık",
    "This file cannot be edited here: binary, larger than half a megabyte, or mixed line endings",
  ],
  "viewer.failed": ["Dosya okunamadı", "Could not read the file"],
  "viewer.binary": ["İkili dosya — içerik gösterilmiyor", "Binary file — contents not shown"],
  "viewer.truncated": [
    "Dosyanın ilk 512 KB'ı gösteriliyor; devamı kesildi",
    "Showing the first 512 KB of the file; the rest is cut off",
  ],
  "git.clean": ["Değişiklik yok", "No changes"],
  "git.noRepo": ["Bu klasör bir git deposu değil", "This folder is not a git repository"],
  "git.noDiff": ["Gösterilecek fark yok", "No diff to show"],
  "git.modified": ["Değişti", "Modified"],
  "git.added": ["Eklendi", "Added"],
  "git.deleted": ["Silindi", "Deleted"],
  "git.renamed": ["Yeniden adlandırıldı", "Renamed"],
  // "Takipsiz" ne dediği anlaşılmıyordu: git'in henüz izlemediği, yani
  // depoya hiç eklenmemiş dosya. Tam sıfat yerine durumu söylüyoruz.
  // "Takip edilmiyor" tek basina anlasilmadi: kullanici "bu ne demek, git add
  // yapilmamis mi?" diye sordu. Cevap evet; ipucu artik onu yaziyor.
  "git.untracked": [
    "Takip edilmiyor — henüz git add yapılmamış",
    "Untracked — not added to git yet",
  ],
  "git.copyPath": ["Dosya yolunu kopyala", "Copy file path"],
  // IntelliJ / WebStorm'daki gibi ayrı pencere: solda HEAD, sağda çalışma ağacı.
  "git.openDiffWindow": ["Farkı yeni pencerede göster", "Show diff in a new window"],

  // ------------------------------------------------------------ fark penceresi
  //
  // İngilizce metinler IntelliJ'in KENDİ metinleri (DiffBundle, ActionsBundle,
  // VcsBundle) — pencere IntelliJ'in birebir karşılığı olsun diye; eylem adları
  // bu yüzden onun yazımıyla (başlık biçimi). Türkçesi cümle biçiminde.
  "diff.prevDifference": ["Önceki fark", "Previous Difference"],
  "diff.nextDifference": ["Sonraki fark", "Next Difference"],
  "diff.openInEditor": ["Düzenle", "Edit Source"],
  "diff.stopEditing": ["Düzenlemeyi kapat", "Stop Editing"],
  "diff.editing": ["Düzenleniyor", "Editing"],
  "diff.readOnlyEditHint": ["Salt okunur — düzenlemek için kaleme basın", "Read-only — press the pencil to edit"],
  // Fark penceresinin araç çubuğu ve dosya görüntüleyicisi ortak.
  "edit.edit": ["Düzenle", "Edit"],
  "edit.undo": ["Geri al", "Undo"],
  "edit.redo": ["İleri al", "Redo"],
  "edit.save": ["Kaydet", "Save"],
  "diff.prevFile": ["Önceki dosyayı karşılaştır", "Compare Previous File"],
  "diff.nextFile": ["Sonraki dosyayı karşılaştır", "Compare Next File"],
  "diff.goToFile": ["Değişen dosyaya git…", "Go to Changed File…"],
  // Araç çubuğundaki sayaç: tek dosyada soluk "1 dosya", birden fazlasında "2/5 dosya".
  "diff.oneFile": ["1 dosya", "1 file"],
  "diff.fileOf": ["{i}/{n} dosya", "{i}/{n} files"],
  "diff.collapse": ["Değişmemiş parçaları daralt", "Collapse Unchanged Fragments"],
  "diff.sideBySide": ["Yan yana görünüm", "Side-by-side viewer"],
  "diff.unified": ["Birleşik görünüm", "Unified viewer"],
  "diff.settings": ["Ayarlar", "Settings"],
  "diff.syncScroll": ["Eş zamanlı kaydır", "Synchronize Scrolling"],
  "diff.ignore": ["Yok sayılan farklar", "Ignore Differences"],
  "diff.ignore.none": ["Hiçbiri", "None"],
  "diff.ignore.trim": ["Baştaki ve sondaki boşluklar", "Trim whitespaces"],
  "diff.ignore.whitespace": ["Bütün boşluklar", "Ignore whitespaces"],
  "diff.ignore.blankLines": ["Boşluklar ve boş satırlar", "Ignore whitespaces and empty lines"],
  "diff.highlight": ["Farkları vurgulama", "Highlighting Differences"],
  "diff.highlight.words": ["Sözcükler", "Words"],
  "diff.highlight.lines": ["Satırlar", "Lines"],
  "diff.highlight.split": ["Bölünmüş değişiklikler", "Split changes"],
  "diff.highlight.chars": ["Karakterler", "Characters"],
  "diff.highlight.none": ["Hiçbiri", "None"],
  // Sağ üstteki durum: IntelliJ'in `diff.count.differences.status.text`i.
  "diff.count.one": ["1 fark", "1 difference"],
  "diff.count.other": ["{n} fark", "{n} differences"],
  "diff.noDifferences": ["Fark yok", "No differences"],
  // Metinler farklı ama seçilen boşluk kipinde hepsi yok sayıldı.
  "diff.ignored": ["Farklar yok sayıldı", "Differences ignored"],
  "diff.highlightOff": ["Fark vurgulama kapalı", "Differences highlighting is off"],
  // Yerel değişiklikte sağ başlık: IntelliJ'in `merge.version.title.current`i.
  "diff.currentVersion": ["Güncel sürüm", "Current version"],
  "diff.readOnly": ["Salt okunur", "Read-only"],
  "diff.identical": ["İçerikler aynı", "Contents are identical"],
  "diff.onlySeparators": [
    "İçerikler yalnızca satır sonlarında farklı",
    "Contents have differences only in line separators",
  ],
  "diff.tooLarge": [
    "Dosya çok büyük. Yalnızca önizleme yüklendi.",
    "File is too large. Only preview is loaded.",
  ],
  "diff.hide": ["Gizle", "Hide"],
  "diff.binaryDifferent": ["Dosya içerikleri farklı", "Files contents are different"],
  "diff.contentAdded": ["İçerik eklendi", "Content added"],
  "diff.contentRemoved": ["İçerik silindi", "Content removed"],
  "diff.missing": [
    "Dosya ne HEAD'de ne de çalışma ağacında var",
    "The file exists neither in HEAD nor in the working tree",
  ],
  "diff.loadFailed": ["Fark hesaplanamadı", "Unable to calculate diff"],
  // `»`: yerel değişiklikte IntelliJ'in ipucu "Revert"; Ctrl ile "Append".
  "diff.revert": ["Geri al", "Revert"],
  "diff.append": ["Arkasına ekle", "Append"],
  // Sağ taraf yazılabilir; kaydetmeden önce dosya diskte değiştiyse (IntelliJ:
  // "File Cache Conflict" — Load File System Changes / Keep Memory Changes).
  "diff.conflict": [
    "Dosya diskte değişti; buradaki değişiklikleriniz kaydedilmedi",
    "The file changed on disk; your changes here were not saved",
  ],
  "diff.loadDisk": ["Diskteki hâli yükle", "Load File System Changes"],
  "diff.keepMine": ["Benimkini kaydet", "Keep Memory Changes"],
  "diff.notText": [
    "Dosya UTF-8 değil; buradaki değişiklikler kaydedilemiyor",
    "The file is not UTF-8; your changes here cannot be saved",
  ],
  "git.openFile": ["Dosyayı aç", "Open the file"],
  "git.revert": ["Değişiklikleri geri al", "Discard changes"],
  // Panel başlığındaki toplu katlama düğmesi. Dosyalar açık geldiği için
  // varsayılan eylem "daralt"; hepsi kapalıyken aynı düğme açıyor.
  "git.collapseAllFiles": ["Dosyaları daralt", "Collapse files"],
  "git.expandAllFiles": ["Dosyaları aç", "Expand files"],
  // Satırlarda yalnızca dosya adı duruyor; bu düğme klasör zincirini de
  // gösteriyor. Tam yol her durumda satırın ipucunda.
  // Push panelindeki son commit: IntelliJ'in "Undo Commit"i (`reset --soft`).
  "git.undoCommit": [
    "Commit'i geri al — değişiklikler silinmez, eklenmiş olarak listeye döner",
    "Undo Commit — changes are kept and return to the list as staged",
  ],
  "git.undoneCommit": ["{hash} geri alındı; değişiklikler listede", "{hash} undone; the changes are back in the list"],
  "git.undoCommitFailed": ["Commit geri alınamadı", "Could not undo the commit"],
  "git.showPaths": ["Klasör yollarını göster", "Show folder paths"],
  "git.hidePaths": ["Klasör yollarını gizle", "Hide folder paths"],
  // Bağlam açıcıları: `git diff` değişen satırların çevresinde üç satır
  // veriyor, arası çizilmiyor.
  //
  // "Gizli" DEĞİL "değişmemiş": satırlar saklanmıyor, yalnızca değişmedikleri
  // için gösterilmiyorlar. "Gizli" bir sır ima ediyor ve okuyanı "neden
  // gizlenmiş" diye düşündürüyordu; söylenmesi gereken tek şey o satırların
  // NE olduğu. (Warp da "unmodified lines" diyor.)
  "git.unmodifiedLines.one": ["{n} değişmemiş satır", "{n} unmodified line"],
  "git.unmodifiedLines.other": ["{n} değişmemiş satır", "{n} unmodified lines"],
  // Sayı satırın kendisinde yazıyor; ipuçlarında yön ve adım var — "50" tek
  // başına neyin 50'si belli değil.
  "git.expandDown": ["Yukarıdan {n} satır aç", "Show {n} lines from the top"],
  "git.expandUp": ["Aşağıdan {n} satır aç", "Show {n} lines from the bottom"],
  "git.expandAll": ["Kalan satırları aç", "Show the remaining lines"],
  // Düğme KALIYOR ama basılamıyor: hiç düğme çizmemek "burada açacak bir şey
  // yok" diye okunuyordu, oysa var — okunamayan bir dosya var.
  // Denenen YOL da yazıyor: bu düğmenin kapalı kalmasının en olası sebebi
  // yolun yanlış kurulması ve o ancak yolu görünce anlaşılıyor.
  "git.expandUnavailable": [
    "Bu satırlar açılamıyor — dosya okunamadı (silinmiş, ikili ya da erişilemez):\n{path}",
    "These lines cannot be shown — the file could not be read (deleted, binary or unreachable):\n{path}",
  ],
  "confirm.revertTitle": ["Değişiklikleri geri al", "Discard changes"],
  "confirm.revertMessage": [
    "{path} dosyasındaki değişiklikler geri alınsın mı?",
    "Discard the changes in {path}?",
  ],
  "confirm.revertDetail": [
    "Dosya son commit'teki hâline döner. Kaydedilmemiş düzenlemeler kaybolur.",
    "The file returns to its state in the last commit. Unsaved edits are lost.",
  ],
  "confirm.revertUntrackedTitle": ["Dosyayı sil", "Delete the file"],
  "confirm.revertUntrackedMessage": [
    "{path} silinsin mi?",
    "Delete {path}?",
  ],
  // Takipsiz dosyada "geri al" diye bir sey yok: dosyanin kendisi degisiklik.
  // Silmek geri ALINAMAZ, cunku git'te bir kaydi yok - bunu acikca yazmak sart.
  "confirm.revertUntrackedDetail": [
    "Bu dosya git'te takip edilmiyor, yani geri getirilemez.",
    "This file is not tracked by git, so it cannot be brought back.",
  ],
  "confirm.revertButton": ["Geri al", "Discard"],
  "confirm.deleteFile": ["Sil", "Delete"],
  "git.viewChanges": ["Değişiklikleri gör", "View changes"],
  "git.branch": ["Dal", "Branch"],
  "git.searchBranch": ["Dal ara…", "Search branches…"],
  "git.noBranch": ["Dal bulunamadı", "No branches found"],
  "git.currentBranch": ["burada", "current"],
  "git.remoteHint": [
    "Uzak dal; seçilince aynı adla yerel izleme dalı oluşur",
    "Remote branch; picking it creates a local tracking branch of the same name",
  ],
  // Dal seçicide uzak dallar ayrı, açılıp kapanan bir bölümde (bkz.
  // `pickerRows`). Başlığın yanındaki sayı, açmadan "orada bir şey var mı"
  // sorusunu yanıtlıyor.
  "git.remoteBranches": ["Uzak dallar", "Remote branches"],
  "git.remoteGroupHint": [
    "Yalnızca uzakta olan dallar (git fetch ile gelenler)",
    "Branches that exist only on the remote (the ones fetched with git fetch)",
  ],
  // Uzaklar arkadan okunurken başlığın sayısı "…" (bkz. `REMOTES_GRACE_MS`).
  "git.remotesLoading": ["Uzak dallar okunuyor…", "Reading remote branches…"],
  // Tavanın ötesindeki dallar (bkz. `SECTION_ROW_LIMIT`): sayı gerçek, satırlar
  // çizilmiyor. Binlerce dalda aranan dala kaydırarak değil, arayarak varılıyor.
  "git.moreBranches.one": ["{n} dal daha — aramayı daraltın", "{n} more branch — narrow the search"],
  "git.moreBranches.other": [
    "{n} dal daha — aramayı daraltın",
    "{n} more branches — narrow the search",
  ],
  // Değişiklikler panelinde commit ve push. Satırdaki kutu dosyayı commit'e
  // ekliyor (`git add`), kaldırınca çıkarıyor (`git reset`); kutu "kısmen"
  // durumunda dosyanın yalnızca bir kısmı indekste.
  "git.stage": ["Commit'e ekle", "Include in commit"],
  "git.unstage": ["Commit'ten çıkar", "Exclude from commit"],
  "git.stagePartial": [
    "Commit'e yalnızca eklenen kısım girer; kalanını da eklemek için bas",
    "Only the staged part goes into the commit; press to include the rest",
  ],
  "git.selectAll": ["Tüm dosyaları commit'e ekle", "Include all files in the commit"],
  "git.deselectAll": ["Seçimi kaldır", "Clear the selection"],
  "git.stageFailed": ["Dosya seçimi değiştirilemedi", "Could not change the file selection"],
  // Dosya listesinin tablo başlığındaki sütun adı (bkz. `ChangesHeader`).
  "git.colFile": ["Dosya", "File"],
  "git.selectedCount.one": ["{n} dosya seçili", "{n} file selected"],
  "git.selectedCount.other": ["{n} dosya seçili", "{n} files selected"],
  // Değişiklikler başlığı: seçili / listedeki toplam (İSTEK: "toplamda kaç dosya var onu da yazalım").
  "git.selectedOf.one": ["{n}/{total} dosya seçili", "{n}/{total} file selected"],
  "git.selectedOf.other": ["{n}/{total} dosya seçili", "{n}/{total} files selected"],
  // Alan hem etiket hem yer tutucu: ikisi aynı şeyi söylüyor.
  "git.commitMessage": ["Commit iletisi", "Commit message"],
  "git.commit": ["Commit", "Commit"],
  "git.committing": ["Commit atılıyor…", "Committing…"],
  "git.commitHint": [
    "Seçili dosyaları commit'le ({keys})",
    "Commit the selected files ({keys})",
  ],
  // Düğme kapalıyken NEDEN kapalı olduğunu ipucu söylüyor; sırayla "önce ne
  // yapmalıyım" sorusunun cevabı: önce dosya, sonra ileti.
  "git.commitNoFiles": ["Önce commit'e girecek dosyaları seç", "Select the files to commit first"],
  "git.commitNoMessage": ["Commit iletisi yaz", "Write a commit message"],
  "git.committed": ["Commit atıldı: {hash}", "Committed: {hash}"],
  "git.commitFailed": ["Commit atılamadı", "Commit failed"],
  // Gönder düğmesi. "Yayınla": dalın uzakta karşılığı yok (yeni dal ya da
  // uzaktan silinmiş), gönderince uzakta oluşuyor ve izleme kuruluyor.
  "git.push": ["Push", "Push"],
  "git.publish": ["Yayınla", "Publish"],
  "git.pushing": ["Gönderiliyor…", "Pushing…"],
  "git.pushHint.one": [
    "{n} commit gönderilecek → {upstream}",
    "{n} commit will be pushed → {upstream}",
  ],
  "git.pushHint.other": [
    "{n} commit gönderilecek → {upstream}",
    "{n} commits will be pushed → {upstream}",
  ],
  "git.publishHint": [
    "Dal uzakta yok; yayınlanacak ve izleme kurulacak",
    "The branch is not on the remote; it will be published and tracking will be set up",
  ],
  "git.pushNothing": ["Gönderilecek commit yok", "Nothing to push"],
  "git.pushDetached": [
    "HEAD bir dala bağlı değil; gönderilemez",
    "HEAD is not on a branch; nothing can be pushed",
  ],
  "git.pushed": ["Gönderildi: {target}", "Pushed: {target}"],
  "git.pushFailed": ["Gönderilemedi", "Push failed"],
  // Uzak bizden ilerideyse push reddedilir; bunu düğmeye basmadan söylemek
  // reddedilme metnini okumaktan iyi.
  "git.behindHint.one": [
    "Uzakta {n} yeni commit var; push reddedilebilir",
    "The remote has {n} new commit; the push may be rejected",
  ],
  "git.behindHint.other": [
    "Uzakta {n} yeni commit var; push reddedilebilir",
    "The remote has {n} new commits; the push may be rejected",
  ],
  // Değişiklik yokken commit kutusu yok, yalnızca "gönderilmemiş var" satırı.
  "git.unpushed.one": ["{n} commit gönderilmedi", "{n} commit not pushed yet"],
  "git.unpushed.other": ["{n} commit gönderilmedi", "{n} commits not pushed yet"],
  "git.notPublished": ["Bu dal uzakta yok", "This branch is not on the remote"],
  // Gönderilecek commit'ler: Push'un onay paneli (bkz. `PushReview`).
  "git.outgoing": ["Gönderilecek commit'ler", "Commits to push"],
  "git.outgoingFailed": ["Gönderilecek commit'ler okunamadı", "Could not read the commits to push"],
  "git.outgoingNone": ["Gönderilecek yeni commit yok", "No new commits to push"],
  "git.outgoingMore.one": ["… ve {n} commit daha", "… and {n} more commit"],
  "git.outgoingMore.other": ["… ve {n} commit daha", "… and {n} more commits"],
  "git.commitNoFilesInside": ["Bu commit'te dosya değişikliği yok", "No file changes in this commit"],
  // Stash: değişiklikleri geçici olarak kenara alma. Bölüm başlığı, atma penceresi
  // ve liste (bkz. `StashDialog`, `StashSection`). `app.stash` Değişiklikler
  // listesindeki bölümün başlığı; `git.stash` commit kutusundaki düğme.
  "app.stash": ["Stash", "Stash"],
  "git.stash": ["Stash", "Stash"],
  "git.stashHint": [
    "Seçtiğin değişiklikleri geçici olarak kenara al (git stash)",
    "Set the changes you pick aside temporarily (git stash)",
  ],
  "git.stashUnborn": [
    "İlk commit atılmadan stash kullanılamaz",
    "Stash needs at least one commit",
  ],
  "git.stashTitle": ["Değişiklikleri stash'e at", "Stash changes"],
  "git.stashNameLabel": ["Ad", "Name"],
  "git.stashNamePlaceholder": [
    "İsteğe bağlı: ör. ayar penceresi denemesi",
    "Optional: e.g. settings dialog experiment",
  ],
  "git.stashSelectAll": ["Tüm dosyaları seç", "Select all files"],
  "git.stashUntrackedHint": [
    "Takipsiz dosyalar da stash'e alınır (git stash -u)",
    "Untracked files are stashed too (git stash -u)",
  ],
  "git.stashNoFiles": ["Önce en az bir dosya seç", "Select at least one file first"],
  "git.stashConfirm": ["Stash'e at", "Stash"],
  "git.stashing": ["Stash'e atılıyor…", "Stashing…"],
  "git.stashDone": ["Stash'e atıldı: {name}", "Stashed: {name}"],
  "git.stashDoneUnnamed": ["Stash'e atıldı", "Stashed"],
  "git.stashFailed": ["Stash'e atılamadı", "Could not stash"],
  "git.stashEmpty": ["Stash yok", "No stashes"],
  "git.stashListFailed": ["Stash listesi okunamadı", "Could not read the stash list"],
  "git.stashEmptyHint": [
    "Değişiklikleri geçici olarak kenara almak için commit kutusundaki Stash düğmesini kullan.",
    "Use the Stash button in the commit box to set changes aside temporarily.",
  ],
  // Başlıktaki ayar simgesinin ipucu; içindeki iki kutu uygula eyleminin nasıl
  // çalışacağını belirliyor.
  "git.stashOptions": ["Stash seçenekleri", "Stash options"],
  "git.stashPop": ["Uyguladıktan sonra sil (pop)", "Delete after applying (pop)"],
  "git.stashPopHint": [
    "Açıksa uygulanan stash listeden silinir; çakışma olursa silinmez",
    "When on, the applied stash is removed from the list; it stays if there is a conflict",
  ],
  "git.stashIndex": ["İndeksi geri yükle", "Reinstate index"],
  "git.stashIndexHint": [
    "Stash'e atılırken commit'e eklenmiş olanlar yine eklenmiş gelir (git stash --index)",
    "Changes that were staged when stashed come back staged (git stash --index)",
  ],
  // Satır eylemleri. Uygula'nın ipucu açık olan seçeneğe göre değişiyor: aynı
  // simge "koru" da diyebilir "sil" de, hangisinin olacağı basmadan okunmalı.
  "git.stashApplyKeep": ["Uygula (stash listede kalır)", "Apply (the stash stays in the list)"],
  "git.stashApplyPop": ["Uygula ve sil", "Apply and delete"],
  "git.stashDrop": ["Stash'i sil", "Delete the stash"],
  "git.stashApplied": ["Uygulandı: {name}", "Applied: {name}"],
  "git.stashPopped": ["Uygulandı ve silindi: {name}", "Applied and deleted: {name}"],
  "git.stashDropped": ["Silindi: {name}", "Deleted: {name}"],
  "git.stashApplyFailed": ["Stash uygulanamadı", "Could not apply the stash"],
  "git.stashDropFailed": ["Stash silinemedi", "Could not delete the stash"],
  "git.stashUnnamed": ["Adsız", "Unnamed"],
  // Bir revizyonun (stash ya da commit) kesilmiş dosya listesinin sonu.
  "git.moreFiles.one": ["… ve {n} dosya daha", "… and {n} more file"],
  "git.moreFiles.other": ["… ve {n} dosya daha", "… and {n} more files"],
  "git.stashNoFilesInside": ["Bu stash'te dosya bulunamadı", "No files found in this stash"],
  "confirm.dropStashTitle": ["Stash'i sil", "Delete stash"],
  "confirm.dropStashMessage": [
    "“{name}” stash'i silinsin mi?",
    "Delete the stash “{name}”?",
  ],
  // Silmek geri ALINAMAZ; çıkış yolu da yazıyor: önce uygulanabilir.
  "confirm.dropStashDetail": [
    "Stash'teki değişiklikler geri getirilemez. Silmeden önce Uygula ile çalışma ağacına alabilirsin.",
    "The changes in the stash cannot be recovered. You can apply it to the working tree before deleting.",
  ],
  "node.version": ["Node sürümü ({manager})", "Node version ({manager})"],
  "node.pick": ["Kurulu sürümler arasında geç", "Switch between installed versions"],
  "node.noneInUse": ["Sürüm seçilmedi", "No version selected"],
  "node.search": ["Sürüm ara…", "Search versions…"],
  "node.noVersion": ["Kurulu Node sürümü bulunamadı", "No installed Node versions found"],
  "node.current": ["kullanılan", "in use"],
  "node.defaultHint": [
    "Seçim bu kabukta geçerli olur ve yeni kabukların varsayılanı olur (nvm alias default)",
    "Applies to this shell and becomes the default for new shells (nvm alias default)",
  ],
  "common.cancel": ["Vazgeç", "Cancel"],
  "confirm.ok": ["Tamam", "OK"],
  "confirm.closeTabTitle": ["Sekmeyi kapat", "Close tab"],
  "confirm.closeTabMessage": [
    "\"{name}\" sekmesi kapatılacak.",
    "The \"{name}\" tab will be closed.",
  ],
  "confirm.closeTabRunning": [
    "Bu sekmede bir komut çalışıyor; kapatmak onu sonlandırır.",
    "A command is running in this tab; closing it will terminate the command.",
  ],
  "confirm.closeTabDetail": [
    "Kalıcı olarak durması gereken sekmeleri kilitleyebilirsiniz: sağ tık › Kilitle. Bu soruyu Ayarlar › Davranış › Sekme kapatma onayı ile kapatabilirsiniz.",
    "You can lock tabs that must stay open: right-click › Lock. You can turn this question off in Settings › Behavior › Confirm tab close.",
  ],
  "confirm.close": ["Kapat", "Close"],
  "confirm.closeOthersTitle": ["Diğer sekmeleri kapat", "Close other tabs"],
  "confirm.closeOthers.one": [
    "{n} sekme kapatılacak.",
    "{n} tab will be closed.",
  ],
  "confirm.closeOthers.other": [
    "{n} sekme kapatılacak.",
    "{n} tabs will be closed.",
  ],
  "confirm.deleteGroupTitle": ["Grubu sil", "Delete group"],
  "confirm.deleteGroupMessage": [
    "\"{name}\" grubu ve {n} sekmesi kapatılacak.",
    "The \"{name}\" group and its {n} tabs will be closed.",
  ],
  "confirm.delete": ["Sil", "Delete"],
  "confirm.remove": ["Kaldır", "Remove"],
  "confirm.deleteGroupEmptyMessage": [
    "\"{name}\" grubu silinecek.",
    "The \"{name}\" group will be deleted.",
  ],
  "confirm.removeFavoriteTitle": ["Favoriden kaldır", "Remove from favorites"],
  "confirm.removeFavoriteMessage": [
    "\"{command}\" favorilerden kaldırılacak.",
    "\"{command}\" will be removed from favorites.",
  ],
  "confirm.removeFavoriteDetail": [
    "Kısa ad, not ve klasör bilgisi de silinir. Komut geçmişte kalmaya devam eder.",
    "The short name, note and folder are deleted too. The command stays in the history.",
  ],
  "confirm.deleteHistoryTitle": ["Geçmişten sil", "Delete from history"],
  "confirm.deleteHistory.one": [
    "{n} kayıt geçmişten silinecek.",
    "{n} record will be deleted from the history.",
  ],
  "confirm.deleteHistory.other": [
    "{n} kayıt geçmişten silinecek.",
    "{n} records will be deleted from the history.",
  ],
  // Yukarı okun açtığı panelden komut silme. Kapsam metinde: panel o an "bu
  // sekme"yi gösteriyorsa silme de yalnızca bu sekmenin kayıtlarını kapsıyor.
  "confirm.forgetTabMessage": [
    "\"{command}\" bu sekmenin geçmişinden silinecek.",
    "\"{command}\" will be deleted from this tab's history.",
  ],
  "confirm.forgetTabDetail": [
    "Komutun bu sekmedeki bütün kayıtları silinir; diğer sekmelerin geçmişi değişmez.",
    "Every record of the command in this tab is deleted; other tabs' history does not change.",
  ],
  "confirm.forgetAllMessage": [
    "\"{command}\" bütün sekmelerin geçmişinden silinecek.",
    "\"{command}\" will be deleted from the history of every tab.",
  ],
  "confirm.forgetAllDetail": [
    "Komutun bütün kayıtları silinir, hangi sekmede çalıştırılmış olursa olsun.",
    "Every record of the command is deleted, whichever tab ran it.",
  ],
  "confirm.deleteProfileTitle": ["Profili sil", "Delete profile"],
  "confirm.deleteProfileMessage": [
    "\"{name}\" kabuk profili silinecek.",
    "The \"{name}\" shell profile will be deleted.",
  ],
  "confirm.deleteProfileDetail": [
    "Bu profille açılmış sekmeler çalışmaya devam eder; yeni sekmeler varsayılan profille açılır.",
    "Tabs already opened with this profile keep running; new tabs open with the default profile.",
  ],
  "confirm.deleteEnvTitle": ["Değişkeni sil", "Delete variable"],
  "confirm.deleteEnvMessage": [
    "\"{name}\" ortam değişkeni silinecek.",
    "The \"{name}\" environment variable will be deleted.",
  ],
  "confirm.deleteEnvUnnamed": ["Adsız ortam değişkeni silinecek.", "An unnamed environment variable will be deleted."],
  "confirm.runManyTitle": ["Komutları çalıştır", "Run commands"],
  "confirm.runMany.one": [
    "{n} komut sırayla çalıştırılacak.",
    "{n} command will run in order.",
  ],
  "confirm.runMany.other": [
    "{n} komut sırayla çalıştırılacak.",
    "{n} commands will run in order.",
  ],
  "confirm.run": ["Çalıştır", "Run"],
  "confirm.clearHistoryTitle": ["Geçmişi temizle", "Clear history"],
  "confirm.clearHistoryMessage": [
    "\"{scope}\" kapsamındaki tüm komut geçmişi silinecek.",
    "All command history in the \"{scope}\" scope will be deleted.",
  ],
  "confirm.clearHistoryDetail": [
    "Favori komutlar ayrı bir dosyada tutuluyor, etkilenmez.",
    "Favorite commands are kept in a separate file and are not affected.",
  ],
  "confirm.clear": ["Temizle", "Clear"],
  "confirm.resetSettingsTitle": ["Ayarları sıfırla", "Reset settings"],
  "confirm.resetSettingsMessage": [
    "Tüm ayarlar ve kabuk profilleri varsayılanlara dönecek.",
    "All settings and shell profiles will return to their defaults.",
  ],
  "confirm.resetSettingsDetail": [
    "Gruplar, sekmeler, komut geçmişi ve favoriler etkilenmez.",
    "Groups, tabs, command history and favorites are not affected.",
  ],
  "confirm.reset": ["Sıfırla", "Reset"],
  "confirm.replaceWorkspaceTitle": [
    "Gruplar ve sekmeler değiştirilecek",
    "Groups and tabs will be replaced",
  ],
  "confirm.replaceWorkspaceMessage": [
    "Mevcut gruplar ve sekmeler gelen dosyayla değiştirilecek, açık kabuklar kapanacak.",
    "The current groups and tabs will be replaced by the file's, and open shells will close.",
  ],
  "confirm.apply": ["Uygula", "Apply"],
  "common.delete": ["Sil", "Delete"],
  "common.run": ["Çalıştır", "Run"],
  "common.edit": ["Düzenle…", "Edit…"],
  "common.rename": ["Adı değiştir…", "Rename…"],
  "common.name": ["Ad", "Name"],
  "common.color": ["Renk", "Color"],
  "common.file": ["Dosya", "File"],
  "common.default": ["Varsayılan", "Default"],
  "common.missing": ["Yok", "Missing"],
  "common.doubleClick": ["Çift tık", "Double-click"],
  "common.click": ["Tık", "Click"],
  "common.moveUp": ["Yukarı taşı", "Move up"],
  "common.moveDown": ["Aşağı taşı", "Move down"],
  "common.moveLeft": ["Sola taşı", "Move left"],
  "common.moveRight": ["Sağa taşı", "Move right"],
  "common.copyCommand": ["Komutu kopyala", "Copy command"],
  "common.revealFolder": ["Klasörü aç", "Open folder"],
  "common.restartShell": ["Yeniden başlat", "Restart"],
  "common.openFolder": ["Klasörü aç", "Open folder"],
  "common.clipboardFailed": ["Panoya kopyalanamadı", "Could not copy to clipboard"],
  "common.escClose": ["Esc kapat", "Esc to close"],

  // ------------------------------------------------------------- başlık çubuğu
  "app.newGroupTitle": ["Yeni grup ({keys})", "New group ({keys})"],
  "app.history": ["Geçmiş", "History"],
  "app.historyTitle": ["Komut geçmişi ({keys})", "Command history ({keys})"],
  "app.favorites": ["Favoriler", "Favorites"],
  "app.favoritesTitle": ["Favori komutlar ({keys})", "Favorite commands ({keys})"],
  "app.settings": ["Ayarlar", "Settings"],
  "app.settingsTitle": ["Ayarlar ({keys})", "Settings ({keys})"],
  "app.loading": ["N-Terminal yükleniyor…", "Loading N-Terminal…"],
  "app.bootFailed": ["N-Terminal başlatılamadı", "N-Terminal could not start"],
  "app.savingState": ["Durum kaydediliyor…", "Saving state…"],

  // ---------------------------------------------------------- terminal alanı
  "term.noTabs": ["Bu grupta sekme yok.", "No tabs in this group."],
  "term.openHint": [
    "{keys} ile yeni sekme açın.",
    "Press {keys} to open a new tab.",
  ],
  "term.newTab": ["Yeni sekme", "New tab"],
  // Kabuk kapanınca sekme kendiliğinden yeniden başlıyor; bu kutu artık
  // yalnızca kabuk AÇILAMADIĞINDA çıkıyor (yeniden başlatıldı ve hemen yine
  // öldü). Metin bu yüzden "kapandı" değil, tekrarı anlatıyor — yoksa
  // kullanıcı neden bu kez yeniden başlatılmadığını anlamazdı.
  "term.exited": [
    "Kabuk yeniden başlatıldı ama hemen yine kapandı.",
    "The shell was restarted but closed again right away.",
  ],
  "term.exitedHint": [
    "Profilin kabuk yolunu ve başlangıç klasörünü kontrol edin.",
    "Check the profile's shell path and starting folder.",
  ],
  "term.restart": ["Yeniden başlat", "Restart"],
  "term.closeTab": ["Sekmeyi kapat", "Close tab"],
  "term.copy": ["Kopyala", "Copy"],
  "term.paste": ["Yapıştır", "Paste"],
  "term.selectAll": ["Tümünü seç", "Select all"],
  "term.clear": ["Terminali temizle", "Clear terminal"],
  "term.find": ["Terminalde ara…", "Find in terminal…"],
  "term.toPanes": ["Bölme görünümüne geç", "Switch to pane view"],
  "term.toTabs": ["Sekme görünümüne dön", "Back to tab view"],
  "term.prevSessionEnded": ["Önceki oturum burada bitti", "Previous session ended here"],
  "term.spawnFailed": ["Kabuk başlatılamadı:", "Failed to start shell:"],
  "term.scrollToBottom": ["En alta in", "Scroll to bottom"],
  "term.linkFailed": ["Bağlantı açılamadı: {uri}", "Could not open the link: {uri}"],
  "term.sessionEnded": ["Oturum sona erdi", "Session ended"],
  "term.sessionEndedCode": [
    "Oturum sona erdi, çıkış kodu {code}",
    "Session ended, exit code {code}",
  ],

  // ------------------------------------------------------------------ bölmeler
  "pane.running": ["Komut çalışıyor", "Command running"],
  "pane.exited": ["Kabuk kapandı", "Shell exited"],
  "pane.locked": ["Kilitli — sağ tık › Kilidi aç", "Locked — right-click › Unlock"],
  "view.tabs": ["Sekmeler", "Tabs"],
  "view.panes": ["Bölmeler", "Panes"],
  "view.tabsTitle": [
    "Sekme görünümü — tek terminal ({keys})",
    "Tab view — one terminal at a time ({keys})",
  ],
  "view.panesTitle": [
    "Bölme görünümü — grubun sekmeleri yan yana ({keys})",
    "Pane view — the group's tabs side by side ({keys})",
  ],
  "view.heading": ["Görünüm biçimi", "View mode"],
  "view.label": ["Görünüm", "View"],

  // Pencere düğmeleri. Yalnızca Windows/Linux'ta çiziliyor; macOS'ta yerel
  // trafik ışıkları duruyor ve onların kendi erişilebilirlik adları var.
  "window.minimize": ["Küçült", "Minimize"],
  "window.maximize": ["Büyüt", "Maximize"],
  "window.restore": ["Geri al", "Restore"],
  "window.close": ["Kapat", "Close"],
  "view.panesHint": [
    "Etkin grubun bütün sekmeleri aynı ekranda döşenir; tıkladığınız bölme etkin sekme olur. Bölme kipinde grubun her sekmesinin kabuğu başlar.",
    "Every tab in the active group is tiled on one screen; the pane you click becomes the active tab. Pane view starts the shell of every tab in the group.",
  ],
  "view.tabsHint": [
    "Aynı anda tek terminal görünür, ötekiler bellekte bekler.",
    "One terminal is visible at a time; the rest wait in memory.",
  ],
  "view.shortcut": ["Kısayol: {keys}", "Shortcut: {keys}"],

  // -------------------------------------------------------------- sekmeler
  "tab.fallbackName": ["Sekme", "Tab"],
  "tab.namePlaceholder": ["Sekme adı", "Tab name"],
  "tab.lastCommand": ["Son komut: {command}", "Last command: {command}"],
  "tab.renamedHint": [
    "Elle adlandırıldı — çift tıkla değiştir, boş bırak sıfırla",
    "Renamed by hand — double-click to change, leave empty to reset",
  ],
  "tab.nameHint": ["Çift tıkla ad ver", "Double-click to name"],
  "tab.renamed": ["Elle adlandırıldı", "Renamed by hand"],
  "tab.running": ["Komut çalışıyor", "Command running"],
  "tab.exited": ["Kabuk kapandı", "Shell exited"],
  "tab.noIntegration": ["Kabuk entegrasyonu yok", "No shell integration"],
  "tab.notStarted": ["Henüz açılmadı", "Not started yet"],
  "tab.lockedTitle": [
    "Kilitli — klasör sabit · sağ tık › Kilidi aç (ya da {keys})",
    "Locked — the directory is fixed · right-click › Unlock (or {keys})",
  ],
  "tab.closeTitle": ["Kapat ({keys})", "Close ({keys})"],
  "tab.newTabTitle": ["Yeni sekme ({keys})", "New tab ({keys})"],
  "tab.newWithProfile": ["Profil seçerek yeni sekme", "New tab with a specific profile"],
  // Taşma göstergesi: sekmeler şeride sığmadığında çıkıyor.
  "tab.hiddenTabs": [
    "{n} sekme daha var — listeyi aç",
    "{n} more tabs — open the list",
  ],
  "tab.allTabs": ["Bu gruptaki sekmeler", "Tabs in this group"],
  "tab.profileUnavailable": [
    "{name} bu makinede kullanılamıyor",
    "{name} is not available on this machine",
  ],

  // ---------------------------------------------------------- sekme menüsü
  "menu.newTab": ["Yeni sekme", "New tab"],
  "menu.newGroup": ["Yeni grup", "New group"],
  "menu.editProfiles": ["Profilleri düzenle…", "Edit profiles…"],
  "menu.rename": ["Adı değiştir…", "Rename…"],
  "menu.resetName": ["Adı sıfırla", "Reset name"],
  "menu.lock": ["Kilitle", "Lock"],
  "menu.unlock": ["Kilidi aç", "Unlock"],
  "menu.moveToGroup": ["Gruba taşı", "Move to group"],
  "menu.closeTab": ["Sekmeyi kapat", "Close tab"],
  "menu.closeTabLocked": ["Sekmeyi kapat (kilitli)", "Close tab (locked)"],
  "menu.closeOthers": ["Diğerlerini kapat", "Close others"],
  "menu.insertAtPrompt": ["İstem satırına yaz", "Insert at prompt"],
  "menu.addFavorite": ["Favorilere ekle", "Add to favorites"],
  "menu.removeFavorite": ["Favoriden kaldır", "Remove from favorites"],
  "menu.showInFavorites": ["Favoriler panelinde göster", "Show in favorites panel"],
  "menu.deleteFromHistory": ["Geçmişten sil", "Delete from history"],

  // ----------------------------------------------------------------- gruplar
  "group.heading": ["Gruplar", "Groups"],
  "group.namePlaceholder": ["Grup adı", "Group name"],
  "group.showAll": ["Tüm grupları göster ({n})", "Show all groups ({n})"],
  "group.showFavoritesOnly": [
    "Yalnızca favori grupları göster ({n})",
    "Show favorite groups only ({n})",
  ],
  "group.collapseAll": ["Grupları daralt", "Collapse groups"],
  "group.expandAll": ["Grupları aç", "Expand groups"],
  // "Kapat" bir grup icin belirsiz (silmek gibi okunuyor); "Daralt"
  // tam olarak ne oldugunu soyluyor ve tumu/teki ayni fiili kullaniyor.
  "group.collapse": ["Grubu daralt", "Collapse group"],
  "group.expand": ["Grubu aç", "Expand group"],
  "group.noFavorites": [
    "Favori grup yok.\nBir grubun üzerinde sağ tık → Favori gruba ekle.",
    "No favorite groups.\nRight-click a group → Add to favorite groups.",
  ],
  "group.favoriteMark": ["Favori grup", "Favorite group"],
  // Menüde onay kutusu olarak duruyor; başlıktaki düğmenin ipucu sayıyı da
  // yazıyor (`group.showAll` / `group.showFavoritesOnly`) ama bir onay
  // kutusunun etiketi durumu değil KONUYU söylemeli.
  "group.favoritesOnly": ["Yalnızca favori gruplar", "Favorite groups only"],
  // Gruplanmamış sekmelerin kovası. Kenar çubuğunda BAŞLIK olarak yazmıyor
  // (orada başlıksız düz bir liste); bu ad menülerde ve durum çubuğunda,
  // yani grubun adının beklendiği yerlerde görünüyor.
  "group.ungrouped": ["Gruplanmamış", "Ungrouped"],
  "group.looseHint": [
    "Gruba bağlı olmayan sekmeler",
    "Tabs that are not in a group",
  ],
  "group.busy": ["Bu grupta komut çalışıyor", "A command is running in this group"],
  "group.addFavorite": ["Favori gruba ekle", "Add to favorite groups"],
  "group.removeFavorite": ["Favori gruptan çıkar", "Remove from favorite groups"],
  "group.addFavoriteMenu": ["Favori gruba ekle", "Add to favorite groups"],
  "group.removeFavoriteMenu": ["Favori gruptan çıkar", "Remove from favorite groups"],
  "group.changeColor": ["Rengi değiştir", "Change color"],
  "group.settings": ["Grup ayarları…", "Group settings…"],
  "group.newTabHere": ["Bu gruba yeni sekme", "New tab in this group"],
  "group.newTabHereTitle": ["Bu gruba yeni sekme ({keys})", "New tab in this group ({keys})"],
  "group.menuTitle": ["Grup menüsü", "Group menu"],
  "group.addTab": ["Sekme ekle", "Add tab"],
  "group.deleteLockedCount": [
    "Grubu sil ({n} kilitli sekme)",
    "Delete group ({n} locked tabs)",
  ],
  "group.colorClose": ["Kapat", "Close"],
  "group.customColor": ["Özel renk seç", "Pick a custom color"],
  "group.clearColor": ["Rengi kaldır", "Clear color"],
  "group.delete": ["Grubu sil", "Delete group"],

  // ------------------------------------------------------------------- panel
  "panel.close": ["Paneli kapat", "Close panel"],

  // ----------------------------------------------------------------- geçmiş
  "history.scopeTab": ["Bu sekme", "This tab"],
  "history.scopeGroup": ["Bu grup", "This group"],
  "history.scopeAll": ["Tümü", "All"],
  "history.searchPlaceholder": ["Komut veya dizin ara…", "Search command or folder…"],
  "history.hideDupes": ["Tekrarları gizle", "Hide duplicates"],
  "history.emptyTab": [
    "Bu sekmede henüz komut çalıştırılmadı.\nKomutlar çalıştıkça burada birikir.",
    "No commands have run in this tab yet.\nThey pile up here as you run them.",
  ],
  "history.empty": ["Kayıtlı komut yok.", "No commands recorded."],
  "history.running": ["Çalışıyor", "Running"],
  "history.duration": ["Süre: {value}", "Duration: {value}"],
  "history.noActiveTerminal": ["Etkin bir terminal yok", "No active terminal"],
  "history.clipboardFailed": ["Panoya yazılamadı", "Could not write to clipboard"],
  "history.copied.one": ["{n} komut kopyalandı", "{n} command copied"],
  "history.copied.other": ["{n} komut kopyalandı", "{n} commands copied"],
  "history.deleted.one": ["{n} kayıt silindi", "{n} record deleted"],
  "history.deleted.other": ["{n} kayıt silindi", "{n} records deleted"],
  "history.insertTitle": [
    "Komutu istem satırına yaz (çalıştırmaz)",
    "Insert the command at the prompt (does not run it)",
  ],
  "history.runTitle": ["Seçili komutları çalıştır", "Run the selected commands"],
  "history.copyTitle": ["Panoya kopyala", "Copy to clipboard"],
  "history.deleteTitle": [
    "Seçili kayıtları geçmişten sil",
    "Delete the selected records from history",
  ],
  "history.outcomeAll": ["Hepsi", "All"],
  "history.outcomeOk": ["Başarılı", "Succeeded"],
  "history.outcomeErr": ["Hatalı", "Failed"],
  "history.noSearchMatch": ["Bu aramaya uyan komut yok.", "No command matches this search."],
  "history.exitCode": ["Çıkış {code}", "Exit {code}"],
  "history.unknown": ["Bilinmiyor", "Unknown"],
  "history.source": ["Kaynak: {source}", "Source: {source}"],
  "history.selectedPrefix": ["{n} seçili / ", "{n} selected / "],
  "history.records.one": ["{value} kayıt", "{value} record"],
  "history.records.other": ["{value} kayıt", "{value} records"],
  "history.btnInsert": ["Yaz", "Insert"],
  "history.btnRun": ["Çalıştır", "Run"],
  "history.btnCopy": ["Kopyala", "Copy"],
  "history.btnDelete": ["Sil", "Delete"],
  "history.btnClear": ["Temizle", "Clear"],
  "history.clearScopeTitle": [
    "Bu kapsamdaki geçmişi temizle",
    "Clear the history in this scope",
  ],

  // --------------------------------------------------------- geçmişte arama
  "recall.placeholderAll": ["Tüm geçmişte ara…", "Search all history…"],
  "recall.placeholderTab": [
    "Bu sekmenin geçmişinde ara… (Ctrl+A: tüm sekmeler)",
    "Search this tab's history… (Ctrl+A: all tabs)",
  ],
  "recall.emptyAll": ["Henüz kayıtlı komut yok.", "No commands recorded yet."],
  "recall.emptyTab": [
    "Bu sekmede henüz komut çalıştırılmadı. Ctrl+A ile tüm geçmişe bakabilirsiniz.",
    "No commands have run in this tab yet. Press Ctrl+A to search all history.",
  ],
  "recall.noMatch": ["Eşleşen komut yok.", "No matching command."],
  "recall.favorite": ["Favori", "Favorite"],
  "recall.enter": ["Enter çalıştır", "Enter to run"],
  "recall.tabKey": ["Tab yalnızca yaz", "Tab to insert only"],
  "recall.scope": ["Ctrl+A kapsam: {scope}", "Ctrl+A scope: {scope}"],
  "recall.showFavorites": ["Favoriler (Ctrl+F)", "Favorites (Ctrl+F)"],
  "recall.scopeAll": ["tüm sekmeler", "all tabs"],
  "recall.scopeTab": ["bu sekme", "this tab"],

  // -------------------------------------------------------------- favoriler
  "fav.commandEmpty": ["Komut boş olamaz", "Command cannot be empty"],
  "fav.onlyGroup": ["Yalnızca: {name}", "Only: {name}"],
  "fav.save": ["Kaydet", "Save"],
  "fav.add": ["Ekle", "Add"],
  "fav.emptyLine1": ["Henüz favori yok.", "No favorites yet."],
  "fav.emptyLine2": [
    "Geçmiş listesinde bir komutun yanındaki \u2606 işaretine basarak",
    "Press the \u2606 next to a command in the history list,",
  ],
  "fav.emptyLine3": ["ya da aşağıdaki {button} ile ekleyebilirsiniz.", "or use {button} below."],
  "fav.noSearchMatch": ["Bu aramaya uyan favori yok.", "No favorite matches this search."],
  "fav.newButton": ["+ Favori", "+ Favorite"],
  "fav.count.one": ["{n} favori", "{n} favorite"],
  "fav.count.other": ["{n} favori", "{n} favorites"],
  "fav.searchPlaceholder": ["Favorilerde ara…", "Search favorites…"],
  "fav.thisGroup": ["Bu grup", "This group"],
  "fav.commandPlaceholder": ["Komut (zorunlu)", "Command (required)"],
  "fav.labelPlaceholder": ["Kısa ad (isteğe bağlı)", "Short name (optional)"],
  "fav.notePlaceholder": ["Not (isteğe bağlı)", "Note (optional)"],
  "fav.cwdPlaceholder": [
    "Klasör — boşsa etkin sekmenin klasörü",
    "Folder — empty means the active tab's folder",
  ],
  "fav.allGroups": ["Tüm gruplarda görünsün", "Show in all groups"],
  // "Klasör" DEĞİL: hemen üstteki alan da klasör diyor (çalışma dizini) ve
  // iki alan aynı kelimeyle karşılaşınca hangisinin ne olduğu belirsizleşiyor.
  // Listedeki başlık da "Gruplanmamış" diyor; adlandırma onunla tutarlı.
  "fav.folderPlaceholder": ["Grup adı (isteğe bağlı)", "Group name (optional)"],
  // Klasörü olmayan favorilerin başlığı. Boş bırakmak bir eksiklik değil,
  // bir seçim: liste düz de kullanılabilmeli.
  "fav.collapseFolder": ["Grubu daralt", "Collapse group"],
  "fav.expandFolder": ["Grubu aç", "Expand group"],
  "fav.ungrouped": ["Gruplanmamış", "Ungrouped"],
  "fav.rowHint": [
    "Çift tık: çalıştır · tık: istem satırına yaz",
    "Double-click: run · click: insert at prompt",
  ],
  "fav.lastUsed": ["Son: {when}", "Last: {when}"],

  // -------------------------------------------------------------- arama çubuğu
  "find.placeholder": ["Terminalde ara…", "Search in terminal…"],
  "find.caseSensitive": ["Büyük/küçük harf duyarlı", "Match case"],
  "find.wholeWord": ["Tam sözcük", "Whole word"],
  "find.prev": ["Önceki (Shift+Enter)", "Previous (Shift+Enter)"],
  "find.next": ["Sonraki (Enter)", "Next (Enter)"],
  "find.close": ["Kapat (Esc)", "Close (Esc)"],

  // --------------------------------------------------------------- durum çubuğu
  "status.revealHint": ["({fm}'de açmak için tıklayın)", "(click to open in {fm})"],
  "status.running": ["Komut çalışıyor", "Command running"],
  // Bu açıklamalar bir zamanlar ROZET ipuçlarıydı; rozetler çubuktan kalkıp
  // "⋯" menüsüne taşındı (gerekçesi `StatusBar.tsx`) ve metinler menü
  // satırının ipucu olarak orada duruyor. Değerleri kısa (`status.value*`),
  // "neden" ise burada — kısa değer tek başına ne yapılacağını söylemiyor.
  "status.integrationOnTitle": [
    "Kabuk entegrasyonu etkin: komut metni ve çıkış kodu kabuktan geliyor",
    "Shell integration active: command text and exit code come from the shell",
  ],
  "status.integrationOffTitle": [
    "Kabuk entegrasyonu yok: komutlar ekran tamponundan okunuyor, çıkış kodu bilinmiyor",
    "No shell integration: commands are read from the screen buffer, exit code unknown",
  ],
  // Bu satır KABUĞUN tamamlamasını anlatıyor, uygulamanınkini değil. Ayrım
  // önemliydi: "desteklenmiyor" yazınca kullanıcı hiç öneri almadığını
  // sanıyordu, oysa uygulamanın kendi listesi her kabukta çalışıyor ve o
  // sırada ekranda duruyordu. Metinler yalnızca kabuk hakkında konuşuyor.
  "status.predictionOffTitle": [
    "Kabuğun geçmişten tamamlaması kapalı. Ayarlar › Davranış › Kabuğun geçmişten tamamlaması ile açabilirsiniz.\n\nUygulamanın kendi öneri listesi bundan bağımsız çalışmaya devam ediyor.",
    "The shell's history completion is off. Turn it on in Settings › Behavior › The shell's history completion.\n\nThe app's own suggestion list keeps working independently.",
  ],
  "status.predictionOnTitle": [
    "Kabuğun geçmişten tamamlaması etkin ({view}): daha önce çalıştırdığınız komutlar yazarken tamamlanıyor.",
    "The shell's history completion is active ({view}): commands you have run before are completed as you type.",
  ],
  "status.predictionUnsupportedTitle": [
    "Bu kabuk geçmişten tamamlama çizemiyor: PSReadLine 2.2+ gerekiyor, kurulu sürüm daha eski.\n\nUygulamanın kendi öneri listesi çalışmaya devam ediyor; eksik olan yalnızca kabuğun satır içi soluk metni.\n\nOnu da istiyorsanız PowerShell'de bir kez şunu çalıştırın:\nInstall-Module PSReadLine -MinimumVersion 2.2.6 -Force -SkipPublisherCheck\n\nSonra sekmeyi yeniden başlatın (sağ tık › Kabuğu yeniden başlat).",
    "This shell cannot draw history completion: PSReadLine 2.2+ is required and the installed version is older.\n\nThe app's own suggestion list keeps working; only the shell's inline ghost text is missing.\n\nIf you want that too, run this once in PowerShell:\nInstall-Module PSReadLine -MinimumVersion 2.2.6 -Force -SkipPublisherCheck\n\nThen restart the tab (right-click › Restart shell).",
  ],
  // Mac'te bu durum artık BEKLENMİYOR: zsh-autosuggestions uygulamayla birlikte
  // geliyor ve kurulum gerektirmiyor. Buraya düşülüyorsa eklenti dosyası
  // okunamamış demektir — kullanıcının kuracağı bir şey yok, o yüzden metin de
  // kurulum tarifi vermiyor.
  "status.predictionUnsupportedTitleMac": [
    "Kabuğun satır içi tamamlaması yüklenemedi. Bu beklenen bir durum değil: eklenti uygulamayla birlikte geliyor, ayrıca kurmanız gereken bir şey yok.\n\nSekmeyi yeniden başlatmayı deneyin (sağ tık › Kabuğu yeniden başlat).\n\nUygulamanın kendi öneri listesi bundan bağımsız çalışıyor.",
    "The shell's inline completion could not be loaded. This is unexpected: the plugin ships with the app, so there is nothing for you to install.\n\nTry restarting the tab (right-click › Restart shell).\n\nThe app's own suggestion list works independently.",
  ],
  // Bu ikisi menüde TEK SATIR olarak okunuyor ("8 komut", "1 sekme"), etiket
  // + değer olarak değil: "Kayıtlı komut | 8" aynı şeyi iki sütuna bölüyor ve
  // hiçbir şey kazandırmıyordu. `status.tabs` ayrıca komut paletinde de
  // kullanılıyor (grup satırının ipucu).
  "status.commands.one": ["{n} komut", "{n} command"],
  "status.commands.other": ["{n} komut", "{n} commands"],
  "status.tabs.one": ["{n} sekme", "{n} tab"],
  "status.tabs.other": ["{n} sekme", "{n} tabs"],
  "status.portable": ["Taşınabilir", "Portable"],
  "status.portableTitle": [
    "Ayarlar exe'nin yanındaki klasörde: {path}",
    "Settings live in a folder next to the exe: {path}",
  ],
  "status.restored": ["Oturum geri yüklendi", "Session restored"],
  // "⋯" menüsü: durum okumalarının TAMAMI burada. Etiketler iki sütun —
  // solda ne olduğu, sağda değeri ("Profil | Zsh"). Çubuk yalnızca kimliği
  // taşıyor (grup, profil, yol); okumalar oraya sığdıkları için değil,
  // kullanıcı onları sürekli görmek istemediği için menüye indi.
  "status.moreTitle": ["Durum bilgileri", "Status details"],
  "status.moreHeader": ["Durum", "Status"],
  "status.fieldGroup": ["Grup", "Group"],
  "status.fieldCwd": ["Çalışma dizini", "Working directory"],
  "status.fieldIntegration": ["Komut takibi", "Command tracking"],
  // "Kabuk önerisi" ne dediği anlaşılmıyordu: neyin önerildiği de, kimin
  // önerdiği de belirsizdi. Yapılan iş tam olarak şu — kabuk, GEÇMİŞTE
  // çalıştırdığınız komutlardan satırın kalanını tamamlıyor. Ad da onu diyor.
  "status.fieldPrediction": ["Geçmişten tamamlama", "History completion"],
  "status.fieldPid": ["Kabuk pid", "Shell pid"],
  // Menüde etiket ve değer İKİ AYRI SÜTUN ("Komut takibi | Tam"), o yüzden
  // burada yalnızca değer var — rozetteki uzun biçim menüde tekrar olurdu.
  // Cümle içine girmedikleri için büyük harfle başlıyorlar.
  "status.valueIntegrationOn": ["Tam", "Full"],
  "status.valueIntegrationOff": ["Sınırlı", "Limited"],
  "status.valuePredictionOn": ["Açık", "On"],
  "status.valuePredictionOff": ["Kapalı", "Off"],
  "status.valuePredictionUnsupported": ["Desteklenmiyor", "Unsupported"],
  "status.restoredTitle": [
    "Önceki oturumun grup ve sekme düzeni geri yüklendi",
    "The group and tab layout from the previous session was restored",
  ],

  // ------------------------------------------------------------ komut paleti
  "palette.placeholder": [
    "Eylem, grup, sekme veya profil ara…",
    "Search actions, groups, tabs or profiles…",
  ],
  "palette.noMatch": ["Eşleşen eylem yok.", "No matching action."],
  "palette.enter": ["Enter uygula", "Enter to run"],
  "palette.arrows": ["↑↓ gez", "↑↓ navigate"],
  "palette.profileMissing": ["Bu makinede yok", "Not on this machine"],
  "palette.closeActiveTab": ["Etkin sekmeyi kapat", "Close the active tab"],
  "palette.renameTab": ["Sekmeyi yeniden adlandır", "Rename tab"],
  "palette.restartShell": [
    "Sekmedeki kabuğu yeniden başlat",
    "Restart the shell in this tab",
  ],
  "palette.toggleHistory": [
    "Komut geçmişi panelini aç/kapat",
    "Toggle the command history panel",
  ],
  "palette.historySearch": ["Geçmişte hızlı arama", "Quick history search"],
  "palette.favorites": [
    "Favori komutlar panelini aç",
    "Open the favorite commands panel",
  ],
  "palette.transfer": ["Ayarları içe / dışa aktar", "Import / export settings"],
  "palette.reveal": [
    "Etkin sekmenin klasörünü {fm}'de aç",
    "Open the active tab's folder in {fm}",
  ],
  "palette.toggleView": ["Sekme / bölme görünümü", "Toggle tab / pane view"],
  "palette.newTabProfile": ["Yeni sekme: {name}", "New tab: {name}"],
  "palette.switchGroup": ["Gruba geç: {name}", "Switch to group: {name}"],
  "palette.switchTab": ["Sekmeye geç: {name}", "Switch to tab: {name}"],

  // ------------------------------------------------------ ortam değişkenleri
  "env.name": ["AD", "NAME"],
  "env.value": ["Değer", "Value"],
  "env.add": ["+ Değişken ekle", "+ Add variable"],

  // ------------------------------------------------------------------ ayarlar
  "settings.shellCmd": ["Komut İstemi (cmd)", "Command Prompt (cmd)"],
  "settings.shellCustom": ["Özel (entegrasyon yok)", "Custom (no integration)"],
  "settings.historyDedupeDefault": [
    "Geçmiş panelinde tekrarları varsayılan olarak gizle",
    "Hide duplicates in the history panel by default",
  ],
  "settings.addProfile": ["+ Ekle", "+ Add"],
  "settings.scan": ["Tara", "Scan"],
  "settings.removeProfile": ["Sil", "Delete"],
  "settings.keysHint": [
    "Değiştirmek için kutuya tıklayın ve tuş bileşimine basın. Kısayollar ayarlarla birlikte dışa aktarılır.",
    "Click a box and press the key combination to change it. Shortcuts are exported together with the settings.",
  ],
  "settings.aboutBlurb": [
    "Gruplanabilir sekmeli terminal — Windows ve macOS. Tauri + Rust ve xterm.js üzerine kurulu.",
    "A terminal with groupable tabs for Windows and macOS. Built on Tauri + Rust and xterm.js.",
  ],
  "settings.developerHeading": ["Geliştirici", "Developer"],
  "settings.developerLabel": ["Geliştiren", "Developed by"],
  // Ad iki dilde de aynı; sözlükten geçiyor çünkü sabit kodlanmış arayüz
  // metni taraması JSX metinlerini yakalıyor.
  "settings.developerName": ["Nurullah YAYAN", "Nurullah YAYAN"],
  "settings.sourceCode": ["Kaynak kodu", "Source code"],
  "settings.openInBrowser": ["Tarayıcıda aç", "Open in the browser"],
  "settings.licenseLabel": ["Lisans", "License"],
  "settings.licenseValue": ["MIT lisansı", "MIT license"],
  "settings.copyright": ["© 2026 Nurullah YAYAN", "© 2026 Nurullah YAYAN"],
  "settings.openFolderShort": ["Aç", "Open"],
  "settings.title": ["Ayarlar", "Settings"],
  "settings.general": ["Genel", "General"],
  "settings.searchPlaceholder": ["Ayarlarda ara…", "Search settings…"],
  "settings.searchNoResult": ["Eşleşen ayar yok.", "No matching setting."],
  "settings.searchClear": ["Aramayı temizle", "Clear search"],
  "settings.hintShow": ["Açıklamayı göster", "Show description"],
  "settings.undoOne": ["Değişikliği geri al", "Undo this change"],
  "settings.resetAll": ["Ayarları sıfırla", "Reset settings"],
  "settings.hintHide": ["Açıklamayı kapat", "Hide description"],
  "settings.searchCount.one": ["{n} sonuç", "{n} result"],
  "settings.searchCount.other": ["{n} sonuç", "{n} results"],
  "settings.session": ["Oturum", "Session"],
  "settings.navTerminal": ["Terminal", "Terminal"],
  "settings.navHistory": ["Geçmiş", "History"],
  "settings.copyPaste": ["Kopyala ve yapıştır", "Copy and paste"],
  "settings.links": ["Bağlantılar", "Links"],
  "settings.closeTabSection": ["Sekme kapatma", "Closing tabs"],
  "settings.fontSize": ["Boyut ({n} px)", "Size ({n} px)"],
  "settings.lineHeightLabel": ["Satır yüksekliği ({n})", "Line height ({n})"],
  "settings.letterSpacingLabel": ["Harf aralığı ({n})", "Letter spacing ({n})"],
  "settings.scrollbackHint": [
    "Terminalde geriye doğru kaç satır saklanacağı. Yüksek değer daha çok bellek kullanır.",
    "How many lines are kept for scrolling back. A higher value uses more memory.",
  ],
  "settings.tabsHeading": ["Sekmeler", "Tabs"],
  "settings.shellBadge": ["Sekmelerde kabuk rozeti", "Shell badge on tabs"],
  "settings.shellBadgeHint": [
    "Sekme adının solunda hangi kabuğun çalıştığını gösteren kısa kod: PS, PS7, CMD, WSL. Kapatıldığında dar kenar çubuğunda sekme adına daha çok yer kalıyor.",
    "The short code left of the tab name showing which shell is running: PS, PS7, CMD, WSL. Turning it off leaves more room for the tab name in a narrow sidebar.",
  ],
  "settings.restoreSessionLabel": [
    "Açılışta grup ve sekme düzenini geri yükle",
    "Restore the group and tab layout at startup",
  ],
  "settings.restoreScrollbackLabel": [
    "Sekmelerin ekran çıktısını da geri yükle",
    "Restore tab screen output as well",
  ],
  "settings.scrollbackPerTabHint": [
    "Diske yazılan satır sayısı. Kabuk süreçleri uygulamayla kapanır; geri yüklenen içerik geçmiş ekran görüntüsüdür, canlı çıktı değildir.",
    "How many lines are written to disk. Shell processes close with the application; restored content is a past screenshot, not live output.",
  ],
  "settings.historyStats": ["{n} kayıt · {size}", "{n} records · {size}"],
  "settings.appearance": ["Görünüm", "Appearance"],
  "settings.profiles": ["Profiller", "Profiles"],
  "settings.groups": ["Gruplar", "Groups"],
  "settings.keys": ["Kısayollar", "Shortcuts"],
  "settings.about": ["Hakkında", "About"],
  "settings.savedInstantly": [
    "Değişiklikler anında kaydedilir.",
    "Changes are saved instantly.",
  ],

  // Teşhis okuması. Metinler kısa tutuluyor: panelin işi sayıyı göstermek,
  // sayıyı ANLATMAK değil — açıklama ipucu düğmesinin arkasında.
  "health.heading": ["Teşhis", "Diagnostics"],
  "health.hint": [
    "Arayüzün kendi ölçümü. İki satır iki ayrı yoldan geçiyor: görev kuyruğu çizimden bağımsız, çizim döngüsü ise GPU'ya bağlı. İkisi birden takılıyorsa sebep ana iş parçacığında (JavaScript, terminal); yalnızca çizim takılıyorsa çizim hattında (WebView2, GPU). Takılma kaydı geçmişe dönük tutulur: donma geçtikten sonra da okunabilir.",
    "The interface measuring itself. The two rows travel different paths: the task queue is independent of rendering, the draw loop depends on the GPU. If both stall, the cause is on the main thread (JavaScript, terminal); if only drawing stalls, it is the rendering pipeline (WebView2, GPU). Stutters are recorded, so they can be read after a freeze has passed.",
  ],
  "health.uptime": ["Açık kalma süresi", "Uptime"],
  "health.taskQueue": ["Görev kuyruğu sapması", "Task queue drift"],
  "health.drawLoop": ["Çizim döngüsü boşluğu", "Draw loop gap"],
  "health.frameLine": [
    "Ortanca {median} ms · p95 {p95} ms · en büyük {max} ms",
    "Median {median} ms · p95 {p95} ms · max {max} ms",
  ],
  "health.noSamples": ["Ölçüm yok", "No samples"],
  "health.terminals": ["Canlı terminaller", "Live terminals"],
  "health.terminalLine": [
    "{lines} satır · {markers} işaretçi · {decorations} dekorasyon · {blocks} blok",
    "{lines} lines · {markers} markers · {decorations} decorations · {blocks} blocks",
  ],
  "health.janks": ["Son takılmalar", "Recent stutters"],
  "health.noJanks": ["Kayda geçen takılma yok", "No stutters recorded"],
  "health.jankLine": [
    "{time} · çizim {gap} ms · kuyruk {task} ms",
    "{time} · drawing {gap} ms · queue {task} ms",
  ],
  "health.copy": ["Ölçümü kopyala", "Copy report"],
  "health.copied": ["Ölçüm panoya kopyalandı", "Report copied to clipboard"],

  "settings.language": ["Dil", "Language"],
  "settings.languageLabel": ["Arayüz dili", "Interface language"],
  "settings.languageHint": [
    "Tarih ve saat biçimleri de dille birlikte değişir. Ayar dışa aktarılan dosyaya da girer.",
    "Date and time formats change with the language too. The setting travels with exported files.",
  ],

  "settings.theme": ["Tema", "Theme"],
  "settings.colorTheme": ["Renk teması", "Color theme"],
  // Başlık "Terminal" diyor çünkü artık iki yazı tipi ayarı var ve ikisi de
  // aynı bölümde. Ayrımı başlıkta yapmak, iki alanın etiketini kısa
  // tutabilmenin de tek yolu.
  "settings.font": ["Terminal yazı tipi", "Terminal font"],
  "settings.uiFont": ["Arayüz yazı tipi", "Interface font"],
  "settings.uiFontFamily": ["Arayüz yazı tipi", "Interface font"],
  "settings.uiFontSystem": ["Sistemin kendi yazı tipi", "The system font"],
  "settings.uiFontSize": ["Arayüz boyutu ({n} px)", "Interface size ({n} px)"],
  "settings.uiFontHint": [
    "Menüler, paneller, sekme adları ve ayarlar bu ölçüye göre büyüyüp küçülür. Terminalin yazı tipi ve boyutu ayrı: onu değiştirmek satıra kaç sütun sığdığını da değiştirdiği için tek bir ayara bağlanmadı.",
    "Menus, panels, tab names and settings scale with this size. The terminal's font and size are separate: changing those also changes how many columns fit on a line, so the two are not tied to one setting.",
  ],
  "settings.fontFamily": ["Yazı tipi ailesi", "Font family"],
  "settings.highlightLinks": [
    "Çıktıdaki bağlantıları renkli göster",
    "Highlight links in the output",
  ],
  "settings.highlightLinksHint": [
    "Bağlantılar vurgu renginde görünür ve tıklanınca varsayılan tarayıcıda açılır. Çok yoğun çıktı üreten işlerde kapatmak çizimi hafifletir.",
    "Links appear in the accent color and open in the default browser when clicked. Turning it off lightens rendering for very noisy output.",
  ],
  "settings.cursorScroll": ["İmleç ve kaydırma", "Cursor and scrolling"],
  "settings.cursorStyle": ["İmleç biçimi", "Cursor style"],
  "settings.cursorBar": ["Çizgi", "Bar"],
  "settings.cursorBlock": ["Blok", "Block"],
  "settings.cursorUnderline": ["Alt çizgi", "Underline"],
  "settings.cursorBlink": ["İmleç yanıp sönsün", "Blink the cursor"],
  "settings.scrollbackLines": ["Kaydırma tamponu (satır)", "Scrollback (lines)"],

  "settings.sessionRestore": ["Oturum devamlılığı", "Session continuity"],
  "settings.scrollbackPerTab": [
    "Sekme başına kaydedilecek satır",
    "Lines saved per tab",
  ],
  "settings.inheritCwd": [
    "Yeni sekme etkin sekmenin klasöründe açılsın",
    "Open new tabs in the active tab's folder",
  ],
  "settings.copyOnSelect": ["Seçim yapınca panoya kopyala", "Copy to clipboard on selection"],
  "settings.rightClick": ["Sağ tık", "Right-click"],
  "settings.rightClickMenu": [
    "Menü açsın (kopyala / yapıştır / ara)",
    "Open a menu (copy / paste / find)",
  ],
  "settings.rightClickCopyPaste": [
    "Seçim varsa kopyala, yoksa yapıştır",
    "Copy if there is a selection, otherwise paste",
  ],
  "settings.rightClickPaste": ["Her zaman yapıştırsın", "Always paste"],
  "settings.ctrlCCopies": ["Ctrl+C seçim varken kopyalasın", "Ctrl+C copies when there is a selection"],
  "settings.ctrlCHint": [
    "Seçim yoksa Ctrl+C her zaman kabuğa gider (çalışan komutu durdurur). Kopyalamadan sonra seçim temizlenir, böylece ikinci Ctrl+C komutu durdurur.",
    "With no selection Ctrl+C always goes to the shell (interrupting the running command). The selection is cleared after copying, so a second Ctrl+C interrupts.",
  ],
  "input.placeholder": ["Komut yazın", "Type a command"],
  // Hem şeridin metni hem komut çalışırken kutunun yer tutucusu. Kısa ve
  // durum bildiren: kutunun yazılacak yer olduğunu odak ve imleç zaten
  // söylüyor, arayüzün kendini anlatması gerekmiyor.
  "input.running": ["Komut çalışıyor…", "Command running…"],
  "input.starting": ["Kabuk başlatılıyor…", "Starting shell…"],
  "input.stop": ["Durdur", "Stop"],
  "input.stopTitle": [
    "Çalışan komutu durdurur (SIGINT). Klavyeden Ctrl+C; odak kutuda ya da terminalde değilse arka arkaya iki kez.",
    "Stops the running command (SIGINT). From the keyboard: Ctrl+C — twice in a row when the focus is outside the box and the terminal.",
  ],
  // İlk basıştan sonraki hâl. Metin EMİR kipinde ve kısa: kullanıcı o an
  // tuşun üstünde ve okuyacak vakti yok.
  "input.stopAgain": ["Durdurmak için tekrar basın", "Press again to stop"],
  "input.stopAgainShort": ["Tekrar basın", "Press again"],
  "runLinks.label": ["Sunucu", "Server"],
  "block.copyCommand": ["Komutu kopyala", "Copy command"],
  "block.copyCommandShort": ["Komut", "Command"],
  "block.copyOutput": ["Çıktıyı kopyala", "Copy output"],
  "block.copyOutputShort": ["Çıktı", "Output"],
  "block.rerun": ["Komutu satıra koy", "Put the command on the line"],
  "block.rerunShort": ["Yeniden", "Reuse"],
  "suggest.title": ["GEÇMİŞ", "HISTORY"],
  "suggest.titleDirs": ["KLASÖRLER", "FOLDERS"],
  "suggest.hintNav": ["gez", "navigate"],
  "suggest.hintAccept": ["kabul et", "accept"],
  "suggest.hintDismiss": ["kapat", "dismiss"],
  "suggest.hintDelete": ["sil", "delete"],
  "suggest.deleteTitle": ["Geçmişten sil ({key})", "Delete from history ({key})"],
  "suggest.deleteFailed": [
    "Komut geçmişten silinemedi",
    "Could not delete the command from the history",
  ],
  "settings.appSuggestions": [
    "Uygulamanın kendi geçmişinden öneri (her kabukta)",
    "Suggest from the app's own history (in every shell)",
  ],
  "settings.appSuggestionsHint": [
    "Yazdıkça istemin altında bir liste açılır: yukarı/aşağı okla seçilir, sağ okla kabul edilir, Esc ile kapanır. Liste açıkken ok tuşları listede gezinir; boş satırda liste kapalı olduğu için oklar kabuğun kendi geçmişine gider. Kabuğun geçmişten tamamlamasından bağımsız çalışır ve cmd ile bash'te de vardır.",
    "As you type, a list opens below the prompt: select with up/down, accept with the right arrow, dismiss with Esc. While the list is open the arrow keys move within it; on an empty line the list is closed so the arrows reach the shell's own history. It works independently of the shell's history completion and is available in cmd and bash too.",
  ],
  "settings.fontBundled": ["Uygulamayla gelen", "Bundled with the app"],
  "settings.fontInstalled": ["Sisteminizde kurulu", "Installed on your system"],
  "settings.fontCustom": ["Özel…", "Custom…"],
  "settings.fontCustomHint": [
    "Yazı tipi adı ya da yığın",
    "Font name or stack",
  ],
  "settings.commandLine": ["Komut satırı", "Command line"],
  "settings.blockHeaders": [
    "Kabuk istemi yerine blok başlığı",
    "Block header instead of the shell prompt",
  ],
  "settings.blockHeadersHint": [
    "Kabuk görünür bir istem yazmaz; dizin, süre ve çıkış durumu bloğun kendi başlığında gösterilir. Ekrandan uzun yol dizesi kalkar. Şimdilik yalnızca PowerShell: başlık yalnızca kabuğun bunu bildirdiği sekmelerde çizilir, diğerlerinde istem olduğu gibi kalır.",
    "The shell writes no visible prompt; the directory, duration and outcome appear in the block's own header instead, so the long path string leaves the screen. PowerShell only for now: the header is drawn only in tabs where the shell reports it, and the prompt stays as it is elsewhere.",
  ],
  "settings.commandBlocks": [
    "Komutları blok olarak göster",
    "Show commands as blocks",
  ],
  "settings.commandBlocksHint": [
    "Her komut ve çıktısı görsel olarak ayrı bir birim olur: solda çıkış durumunu gösteren bir şerit (yeşil başarılı, kırmızı hatalı, mavi çalışıyor), sağda süre, üzerine gelince komutu ya da çıktıyı kopyalama düğmeleri. Sınırlar kabuk entegrasyonundan geliyor; entegrasyonu olmayan profillerde hiçbir şey çizilmez.",
    "Each command and its output becomes a visual unit: a stripe on the left showing the outcome (green succeeded, red failed, blue running), the duration on the right, and buttons to copy the command or its output on hover. The boundaries come from shell integration; nothing is drawn in profiles without it.",
  ],
  "settings.appInput": [
    "Komut satırını uygulama çizsin (terminalin dışında)",
    "Let the app draw the command line (outside the terminal)",
  ],
  "settings.appInputHint": [
    "Yazdıklarınız pencerenin dibindeki kutuda toplanır ve kabuğa Enter’da gider; kaydırma satırı oynatmaz. Komut çalışırken kutu o komutun yanıt satırı olur: programın sorusuna yanıt buraya yazılır, kutu boşken oklar ve Enter doğrudan programa gider. vim gibi tam ekran programlarda ve kabuk entegrasyonu olmayan profillerde tuşlar doğrudan terminale gider. Tab kutuda kalır: öneri listesi açıkken seçili satırı kabul eder (cd için klasörler arasında kat kat iner), kapalıyken bir şey yapmaz; komut çalışırken yazılanı tamamlaması için programa devreder.",
    "What you type collects in a box at the bottom of the window and reaches the shell on Enter, so scrolling never moves it. While a command runs, the box becomes that command’s input line: answers to its questions are typed here, and with the box empty the arrow keys and Enter go straight to the program. In full-screen programs such as vim and in profiles without shell integration, keys go straight to the terminal. Tab stays in the box: with the suggestion list open it accepts the selected row (for cd it walks down folder by folder); with the list closed it does nothing; while a command runs it hands what you typed to the program to complete.",
  ],
  "settings.promptAtBottom": [
    "Komut satırı her zaman pencerenin dibinde dursun",
    "Keep the command line at the bottom of the window",
  ],
  "settings.promptAtBottomHint": [
    "İstem çizilmeden önce imleç son satıra iniyor; çıktılar ve öneri listesi üstte kalan boşluğa yerleşiyor. Kabuk entegrasyonu gerektiriyor ve şimdilik yalnizca PowerShell’de çalışıyor. Kabuğun kendi liste görünümüyle (“İstemin altında liste”) birlikte kullanmayın: liste çizilecek yer bulamayıp ekranı yukarı iter.",
    "The cursor drops to the last row before the prompt is drawn, so output and the suggestion list sit in the space above. Requires shell integration and currently works in PowerShell only. Do not combine it with the shell’s own list view (“List below the prompt”): the list has nowhere to go and pushes the screen up.",
  ],
  "settings.predictionListBlocked": [
    "Komut satırı dipte dururken liste görünümü çalışamıyor: PSReadLine listeyi imlecin altına çiziyor ve orada yer olmadığı için ekranı yukarı itiyor. Bu oturumda satır içi hayalet metin kullanılıyor; listeyi uygulama kendi paneliyle çiziyor.",
    "The list view cannot work while the command line is pinned to the bottom: PSReadLine draws the list below the cursor and, with no room there, pushes the screen up. Inline ghost text is used instead; the app draws the list in its own panel.",
  ],
  "settings.prediction": ["Komut önerisi", "Command suggestions"],
  "settings.predictionShell": [
    "Kabuğun geçmişten tamamlaması",
    "The shell's history completion",
  ],
  "settings.predictionList": [
    "İstemin altında liste (yukarı/aşağı ok ile seç)",
    "List below the prompt (select with up/down)",
  ],
  "settings.predictionInline": [
    "Satır içi soluk metin (sağ ok ile kabul et)",
    "Inline ghost text (accept with right arrow)",
  ],
  "settings.predictionOff": ["Kapalı (kabuğun kendi ayarı)", "Off (leave it to the shell)"],
  "settings.predictionHint": [
    "Daha önce çalıştırdığınız komutlardan satırın kalanını yazarken tamamlar. Tamamlamayı kabuk çiziyor: PowerShell 7.2+ (PSReadLine 2.2+) gerekiyor. Windows PowerShell 5.1, cmd ve bash bunu desteklemiyor — orada uygulamanın kendi öneri listesi devrede kalır, ayrıca Ctrl+R geçmiş aramasını kullanabilirsiniz.",
    "Completes the rest of the line from commands you have run before. The shell draws the completion, so PowerShell 7.2+ (PSReadLine 2.2+) is required. Windows PowerShell 5.1, cmd and bash do not support it — the app's own suggestion list stays available there, and you can also use the Ctrl+R history search.",
  ],
  "settings.predictionHintMac": [
    "Daha önce çalıştırdığınız komutlardan satırın kalanını yazarken tamamlar. Tamamlamayı kabuk çiziyor. zsh için gereken eklenti (zsh-autosuggestions) uygulamayla birlikte geliyor, kurmanız gereken bir şey yok; kendi kurulumunuz varsa o kullanılır. pwsh'de PSReadLine 2.2+ gerekiyor. bash bunu desteklemiyor — orada Ctrl+R geçmiş aramasını kullanın.",
    "Completes the rest of the line from commands you have run before. The shell draws the completion. The plugin zsh needs (zsh-autosuggestions) ships with the app, so there is nothing to install; if you have your own copy, that one is used. pwsh needs PSReadLine 2.2+. bash does not support it — use the Ctrl+R history search there.",
  ],
  // ---------------------------------------------------------- güncelleme
  //
  // Uygulama kendini GÜNCELLEMİYOR, haber veriyor: yeni sürümü indirip kuran
  // bir akış imza anahtarı, imzalı paket üreten bir CI ve yayımlanan bir
  // sürüm akışı istiyor; üçü kurulmadan çalışmıyor. Bildirim ise bugün
  // çalışıyor ve hiçbir kuruluma bağlı değil.
  "update.available": ["{v} hazır", "{v} available"],
  "update.availableTitle": [
    "Yeni sürüm yayımlandı. Ayrıntılar için Ayarlar › Hakkında.",
    "A new version is out. See Settings › About for details.",
  ],
  "update.heading": ["Güncelleme", "Update"],
  "update.newVersion": ["Yeni sürüm", "New version"],
  "update.upToDate": ["Bu sürüm güncel.", "This version is up to date."],
  "update.openPage": ["İndirme sayfasını aç", "Open the download page"],
  "update.notes": ["Sürüm notları", "Release notes"],
  "update.check": ["Güncellemeleri denetle", "Check for updates"],
  "update.checking": ["Denetleniyor…", "Checking…"],
  "update.failed": [
    "Denetlenemedi — ağ bağlantısını kontrol edin.",
    "Could not check — check your network connection.",
  ],
  "update.autoCheck": [
    "Açılışta yeni sürüm denetle",
    "Check for a new version at startup",
  ],
  "update.autoCheckHint": [
    "Uygulama her açılışta GitHub'daki son yayına bakar ve yenisi varsa durum çubuğunda haber verir. İndirme ve kurulum size ait — uygulama kendini değiştirmiyor. Kapalıyken hiçbir ağ isteği yapılmaz; denetlemeyi buradaki düğmeyle elle de yapabilirsiniz.",
    "The app checks the latest GitHub release at every startup and tells you in the status bar when a newer one exists. Downloading and installing is up to you — the app never replaces itself. When off, no network request is made; you can also check by hand with the button here.",
  ],
  // Menü çubuğu / bildirim alanı simgesi.
  //
  // `tray.*` metinlerini işletim sistemi çiziyor ve arayüz yüklenmeden önce
  // kuruluyorlar, o yüzden Rust tarafında da yazılılar (`src-tauri/src/tray.rs`).
  // İkisinin ayrılmaması `trayLabels.test.ts` ile bağlı.
  "tray.show": ["N-Terminal'i göster", "Show N-Terminal"],
  "tray.quit": ["Çıkış", "Quit"],
  "settings.closeAction": ["Kapatma düğmesi", "Close button"],
  "settings.closeActionQuit": ["Uygulamadan tamamen çık", "Quit the app"],
  "settings.closeActionBackground": [
    "Arka planda çalışmaya devam et",
    "Keep running in the background",
  ],
  "settings.closeActionHint": [
    "\"Arka planda\" seçilirse pencere kapanır ama çalışan komutlar kesilmez; uygulamaya menü çubuğundaki (macOS) ya da saatin yanındaki (Windows) simgeden geri dönersiniz. Simge her iki durumda da duruyor, yani uygulamaya ulaşamama gibi bir durum olmuyor.",
    "With \"in the background\", the window closes but running commands keep going; you return to the app from the menu bar icon (macOS) or the one next to the clock (Windows). The icon is there either way, so the app never becomes unreachable.",
  ],
  "settings.macOptionIsMeta": ["Option tuşu Meta olsun", "Use Option as Meta"],
  "settings.macOptionIsMetaHint": [
    "Açıkken Option+B / Option+F kelime kelime gezinir, Option+Backspace kelimeyi siler — Windows'ta Alt'ın yaptığı iş. Kapalıyken Option normal karakter üretir; Türkçe Mac klavyesinde @ = Option+Q olduğu için varsayılan kapalı.",
    "When on, Option+B / Option+F move by word and Option+Backspace deletes a word — what Alt does on Windows. When off, Option produces its normal character; the default is off because @ is Option+Q on the Turkish Mac layout.",
  ],
  "settings.confirmCloseTab": ["Sekme kapatma onayı", "Confirm tab close"],
  "settings.confirmAlways": ["Her zaman sor", "Always ask"],
  "settings.confirmRunning": [
    "Yalnızca komut çalışıyorsa sor",
    "Ask only when a command is running",
  ],
  "settings.confirmNever": ["Hiç sorma", "Never ask"],
  "settings.confirmCloseTabHint": [
    "Yanlışlıkla çarpıya basmaya karşı. Kilitli sekmeler bu ayardan bağımsız olarak hiç kapanmaz; kalıcı olarak durması gereken sekmeler için kilit daha güçlü bir koruma.",
    "Guards against hitting ✕ by accident. Locked tabs never close regardless of this setting — for tabs that must stay, the lock is the stronger protection.",
  ],
  "settings.history": ["Komut geçmişi", "Command history"],
  "settings.historyLimit": ["Azami kayıt sayısı", "Maximum records"],
  "settings.historyLimitHint": [
    "Sınır aşılınca en eski kayıtlar silinir. Şu an: {size}",
    "Once the limit is passed the oldest records are dropped. Currently: {size}",
  ],
  "settings.historyReading": ["okunuyor…", "reading…"],

  "settings.rescan": ["Makinedeki kabukları tara", "Scan for shells on this machine"],
  "settings.pickProfile": ["Soldan bir profil seçin.", "Pick a profile on the left."],
  "settings.pickGroup": ["Soldan bir grup seçin.", "Pick a group on the left."],
  "settings.shellKind": ["Kabuk türü", "Shell type"],
  // Egik cizgi IKI PARALEL etiketi birlestiriyor ("Ice aktar" / "Disa
  // aktar"). Birinin buyuk otekinin kucuk olmasi tutarsiz duruyor; iki taraf
  // da kendi bas harfini aliyor.
  "settings.openTransfer": ["İçe / Dışa aktar…", "Import / Export…"],
  "settings.groupEnvHint": [
    "Profilin değişkenlerinin üstüne yazılır. Örnek: bir proje grubunda {example}.",
    "Overrides the profile's variables. For example, {example} in a project group.",
  ],
  "settings.groupEnvApplyHint": [
    "Değişiklikler yeni açılan sekmelerde geçerli olur.",
    "Changes take effect in newly opened tabs.",
  ],
  "settings.shellKindHint": [
    "Tür, kabuk entegrasyon betiğinin nasıl yükleneceğini belirler.",
    "The type determines how the shell integration script is loaded.",
  ],
  "settings.keyboard": ["Klavye", "Keyboard"],
  "settings.browse": ["Gözat", "Browse"],
  "settings.executable": ["Çalıştırılabilir", "Executable"],
  "settings.executablePlaceholder": [
    "Boş = türe göre varsayılan",
    "Empty = default for the type",
  ],
  "settings.args": ["Argümanlar", "Arguments"],
  "settings.argsPlaceholder": ["Boşlukla ayrılmış", "Space separated"],
  "settings.startFolder": ["Başlangıç klasörü", "Starting folder"],
  "settings.startFolderHome": ["Boş = ev dizini", "Empty = home directory"],
  "settings.startFolderProfile": ["Boş = profilin klasörü", "Empty = the profile's folder"],
  "settings.defaultProfile": ["Varsayılan profil", "Default profile"],
  "settings.envVars": ["Ortam değişkenleri", "Environment variables"],
  "settings.shellIntegrationLoad": [
    "Kabuk entegrasyonunu yükle (komut metni, çıkış kodu, dizin)",
    "Load shell integration (command text, exit code, directory)",
  ],
  "settings.appDefault": ["(uygulama varsayılanı)", "(application default)"],
  "settings.groupName": ["Grup adı", "Group name"],
  "settings.groupDefaultProfile": ["Varsayılan profil", "Default profile"],
  "settings.groupProfileHint": [
    "Bu gruptaki yeni sekmeler bu profille açılır.",
    "New tabs in this group open with this profile.",
  ],
  "settings.groupEnvVars": [
    "Gruba özel ortam değişkenleri",
    "Group-specific environment variables",
  ],
  "settings.keysHeading": ["Klavye kısayolları", "Keyboard shortcuts"],
  "settings.pressKey": ["Tuşa basın…", "Press a key…"],
  "settings.atLeastOneProfile": ["En az bir profil kalmalı", "At least one profile must remain"],
  "settings.noNewShell": ["Yeni kabuk bulunamadı", "No new shells found"],
  "settings.profilesAdded.one": ["{n} profil eklendi", "{n} profile added"],
  "settings.profilesAdded.other": ["{n} profil eklendi", "{n} profiles added"],
  "settings.pickFolder": ["Klasör seç", "Pick a folder"],
  "settings.pickShell": ["Kabuk çalıştırılabiliri seç", "Pick a shell executable"],
  "settings.newProfileName": ["Yeni profil", "New profile"],
  "settings.programFilter": ["Program", "Program"],
  "settings.fileLocations": ["Dosya konumları", "File locations"],
  "settings.dataFolder": ["Veri klasörü", "Data folder"],
  "settings.portableOn": [
    "Taşınabilir kip: ayarlar uygulamanın yanındaki klasörde tutuluyor.",
    "Portable mode: settings are kept in a folder next to the application.",
  ],
  "settings.portableOff": [
    "Taşınabilir kip için exe'nin yanına nterminal-data adlı bir klasör açın.",
    "For portable mode, create a folder named nterminal-data next to the exe.",
  ],
  "settings.workspaceFile": ["Çalışma alanı", "Workspace"],
  "settings.integrationDir": ["Kabuk entegrasyonu", "Shell integration"],

  // ----------------------------------------------------------- aktarım penceresi
  "transfer.title": ["Yapılandırma aktarımı", "Configuration transfer"],
  "transfer.export": ["Dışa aktar", "Export"],
  "transfer.import": ["İçe al", "Import"],
  // "Değiştir" neyin neyle değiştiğini söylemiyordu ve kullanıcı seçeneği
  // arayıp bulamadı: aradığı şey "içerdekini ez" idi. Etiketler artık işlemi
  // adlandırıyor, seçeneği değil.
  "transfer.modeReplace": ["Üzerine yaz", "Overwrite"],
  "transfer.modeMerge": ["Üzerine ekle", "Merge"],
  "transfer.modeSkip": ["Atla", "Skip"],
  "transfer.whatToExport": ["Neler aktarılsın?", "What should be exported?"],
  "transfer.exSettings": [
    "Ayarlar — görünüm, davranış, kabuk profilleri, kısayollar",
    "Settings — appearance, behavior, shell profiles, shortcuts",
  ],
  "transfer.exWorkspace": [
    "Çalışma alanı — gruplar, sekmeler ve klasörleri",
    "Workspace — groups, tabs and their folders",
  ],
  "transfer.exHistory": ["Komut geçmişi", "Command history"],
  "transfer.exFavorites": ["Favori komutlar", "Favorite commands"],
  "transfer.exScrollback": [
    "Sekmelerin ekran çıktısı (dosyayı belirgin şekilde büyütür)",
    "Tab screen output (grows the file noticeably)",
  ],
  "transfer.portability": ["Taşınabilirlik", "Portability"],
  "transfer.portablePaths": [
    "Yolları makineden bağımsız hale getir",
    "Make paths machine-independent",
  ],
  "transfer.portableExplain": [
    "Açıkken {home} gibi yollar {token} belirteciyle yazılır ve karşı makinede o makinenin kendi yollarına açılır. Ayrıca içe alırken kabuk konumları (PowerShell, Git Bash…) o makinede aranır; bulunamayan profiller rapor edilir.",
    "When on, paths like {home} are written with the {token} token and expand to the target machine's own paths. On import, shell locations (PowerShell, Git Bash…) are looked up on that machine; profiles that cannot be found are reported.",
  ],
  "transfer.portableHomeExample": ["C:\\Users\\<siz>\\…", "C:\\Users\\<you>\\…"],
  "transfer.result": ["Sonuç", "Result"],
  "transfer.countProfiles": ["Profil", "Profiles"],
  "transfer.countGroups": ["Grup", "Groups"],
  "transfer.countTabs": ["Sekme", "Tabs"],
  "transfer.countCommands": ["Komut", "Commands"],
  "transfer.countFavorites": ["Favori", "Favorites"],
  "transfer.countScrollback": ["Ekran çıktısı", "Screen output"],
  "transfer.fileSize": ["Dosya boyutu", "File size"],
  "transfer.saveTitle": ["Yapılandırmayı kaydet", "Save configuration"],
  "transfer.pickTitle": ["N-Terminal yapılandırması seç", "Pick an N-Terminal configuration"],
  "transfer.filterName": ["N-Terminal yapılandırması", "N-Terminal configuration"],
  "transfer.exported": ["Yapılandırma dışa aktarıldı", "Configuration exported"],
  "transfer.imported": ["Yapılandırma içe alındı", "Configuration imported"],
  "transfer.pickFile": ["Dosya seç…", "Pick a file…"],
  "transfer.notPicked": ["Henüz seçilmedi", "Nothing picked yet"],
  "transfer.fileContents": ["Dosya içeriği", "File contents"],
  "transfer.madeOn": [
    "{machine}{date} tarihinde N-Terminal {version} ile oluşturuldu. Yollar {paths}.",
    "Created on {date} with N-Terminal {version}{machine}. Paths are {paths}.",
  ],
  "transfer.onMachine": ["{machine} makinesinde ", " on {machine}"],
  "transfer.pathsPortable": ["Taşınabilir", "Portable"],
  "transfer.pathsAbsolute": ["Mutlak", "Absolute"],
  "transfer.notes": [
    "Bu makine için düzeltmeler ve uyarılar",
    "Fixes and warnings for this machine",
  ],
  "transfer.noteFixed": ["Düzeltildi", "Fixed"],
  "transfer.noteWarn": ["Uyarı", "Warning"],
  "transfer.howApplied": ["Nasıl uygulanacak?", "How should it be applied?"],
  "transfer.notInFile": ["(dosyada yok)", "(not in the file)"],
  "transfer.settingsLabel": ["Ayarlar", "Settings"],
  "transfer.workspaceLabel": ["Gruplar ve sekmeler", "Groups and tabs"],
  "transfer.historyLabel": ["Komut geçmişi", "Command history"],
  "transfer.favoritesLabel": ["Favori komutlar", "Favorite commands"],
  "transfer.mergeSettings": [
    "Gelen tercihler geçerli olur; yerelde olup gelende olmayan profiller korunur.",
    "Incoming preferences win; profiles that exist locally but not in the file are kept.",
  ],
  "transfer.mergeWorkspace": [
    "Gelen gruplar mevcutların yanına eklenir; ad çakışırsa '(gelen)' eki alır.",
    "Incoming groups are added next to the existing ones; on a name clash they get an '(imported)' suffix.",
  ],
  "transfer.mergeHistory": [
    "Gelen kayıtlar mevcut geçmişe eklenir, aynı kayıt iki kez yazılmaz.",
    "Incoming records are appended to the existing history; the same record is not written twice.",
  ],
  // "Üzerine yaz" geri dönüşü olmayan tarafı; ne SİLİNDİĞİ seçmeden önce
  // yazıyor. Birleştirme ipuçları neyin ekleneceğini anlatıyor, bunlar neyin
  // gideceğini.
  "transfer.replaceSettings": [
    "Yerel ayarların tamamı gelen dosyayla değişir; buradaki profiller silinir.",
    "All local settings are replaced by the file; the profiles here are removed.",
  ],
  "transfer.replaceWorkspace": [
    "Mevcut gruplar ve sekmeler silinir, yerlerine dosyadakiler gelir.",
    "The existing groups and tabs are deleted and replaced by those in the file.",
  ],
  "transfer.replaceHistory": [
    "Buradaki komut geçmişi silinir, yerine dosyadaki gelir.",
    "The command history here is deleted and replaced by the one in the file.",
  ],
  "transfer.replaceFavorites": [
    "Buradaki favoriler silinir, yerlerine dosyadakiler gelir.",
    "The favorites here are deleted and replaced by those in the file.",
  ],
  "transfer.mergeFavorites": [
    "Gelen favoriler mevcutlara eklenir; aynı komut iki kez yazılmaz.",
    "Incoming favorites are added to the existing ones; the same command is not written twice.",
  ],
  "transfer.restoreScrollback": [
    "Sekmelerin ekran çıktısını da geri yükle",
    "Restore tab screen output as well",
  ],
  "transfer.applied": ["Uygulandı", "Applied"],
  "transfer.appliedSettings": ["Ayarlar: {state}", "Settings: {state}"],
  "transfer.appliedWorkspace": ["Çalışma alanı: {state}", "Workspace: {state}"],
  "transfer.stateApplied": ["Uygulandı", "Applied"],
  "transfer.stateSkipped": ["Atlandı", "Skipped"],
  "transfer.stateAppliedGroups": ["Uygulandı ({n} grup)", "Applied ({n} groups)"],
  "transfer.addedProfiles": ["Eklenen profil: {n}", "Profiles added: {n}"],
  "transfer.addedHistory": ["Eklenen komut kaydı: {n}", "History records added: {n}"],
  "transfer.addedFavorites": ["Eklenen favori: {n}", "Favorites added: {n}"],
  "transfer.addedScrollback": [
    "Geri yüklenen ekran çıktısı: {n}",
    "Screen outputs restored: {n}",
  ],
  "transfer.saving": ["Kaydediliyor…", "Saving…"],
  "transfer.saveToFile": ["Dosyaya kaydet…", "Save to file…"],
  "transfer.applying": ["Uygulanıyor…", "Applying…"],
  "transfer.apply": ["Uygula", "Apply"],
  "transfer.defaultFileName": ["nterminal-ayarlar.json", "nterminal-settings.json"],

  // --------------------------------------------------------- kısayol adları
  "action.newTab": ["Yeni sekme", "New tab"],
  "action.closeTab": ["Sekmeyi kapat", "Close tab"],
  "action.nextTab": ["Sonraki sekme", "Next tab"],
  "action.prevTab": ["Önceki sekme", "Previous tab"],
  "action.newGroup": ["Yeni grup", "New group"],
  "action.commandPalette": ["Komut paleti", "Command palette"],
  "action.historyPanel": ["Geçmiş panelini aç/kapat", "Toggle history panel"],
  "action.historySearch": ["Geçmişte hızlı arama", "Quick history search"],
  "action.favorites": ["Favori komutlar", "Favorite commands"],
  "action.settings": ["Ayarlar", "Settings"],
  "action.renameTab": ["Sekmeyi yeniden adlandır", "Rename tab"],
  "action.toggleLock": ["Sekmeyi kilitle / kilidi aç", "Lock / unlock tab"],
  "action.toggleViewMode": ["Sekme / bölme görünümü", "Tab / pane view"],
  "action.clearTerminal": ["Terminali temizle", "Clear terminal"],
  "action.findInTerminal": ["Terminalde ara", "Find in terminal"],
  "action.copy": ["Kopyala", "Copy"],
  "action.paste": ["Yapıştır", "Paste"],
  "action.zoomIn": ["Yazıyı büyült", "Increase font size"],
  "action.zoomOut": ["Yazıyı küçült", "Decrease font size"],
  "action.zoomReset": ["Yazı boyutunu sıfırla", "Reset font size"],

  // ------------------------------------------------------------ süre birimleri
  "unit.ms": ["{n} ms", "{n} ms"],
  "unit.sec": ["{n} sn", "{n} s"],
  "unit.minSec": ["{m} dk {s} sn", "{m} m {s} s"],
  "unit.hourMin": ["{h} sa {m} dk", "{h} h {m} m"],
  "unit.yesterday": ["dün {time}", "yesterday {time}"],
} as const satisfies Record<string, readonly [string, string]>;

export type MsgKey = keyof typeof MESSAGES;

/** `.one` / `.other` çiftiyle tanımlı anahtarların ortak kökü; `tp()` bunu alıyor. */
export type PluralBase = {
  [K in MsgKey]: K extends `${infer Base}.one` ? Base : never;
}[MsgKey];
