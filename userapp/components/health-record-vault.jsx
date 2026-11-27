import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  TextInput,
  RefreshControl,
  Switch,
  Image,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  X,
  FolderLock,
  Upload,
  Search,
  FileText,
  Image as ImageIcon,
  Camera,
  FolderOpen,
  Images,
  Download,
  Eye,
  Pencil,
  Trash2,
  Lock,
  Users,
  ChevronLeft,
  ArrowDownUp,
  AlertCircle,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { DatePickerField } from './auth/auth-ui';
import ProfileAPI from '../services/profileApi';
import HealthRecordsAPI, {
  RECORD_CATEGORIES,
  SUPPORTED_TYPES,
  formatBytes,
  formatDate,
  validateFile,
} from '../services/healthRecordsApi';

const SORTS = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'name', label: 'A–Z' },
];

const categoryLabel = id => RECORD_CATEGORIES.find(c => c.id === id)?.label || 'Other';

function stripExtension(name) {
  return String(name || '').replace(/\.[a-z0-9]{1,5}$/i, '').slice(0, 120);
}

function sortKey(record) {
  return record.recordDate || record.createdAt || '';
}

function showNotice(title, message) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof window.alert === 'function') {
      window.alert(message ? `${title}\n\n${message}` : title);
    }
    return;
  }
  Alert.alert(title, message);
}

/**
 * Health Record Vault (US-3.7): upload, view/download, categorize, organize and delete
 * the patient's own health files in one place.
 */
export function HealthRecordVaultModal({ visible, onClose, onChanged }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');

  // Sheets: 'source' (choose where the file comes from), 'form' (upload/edit details), 'detail', 'confirm-delete'
  const [sheet, setSheet] = useState(null);
  const [pickedFile, setPickedFile] = useState(null);
  const [editing, setEditing] = useState(null); // record being edited, or null for a new upload
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ title: '', category: '', recordDate: '', notes: '', shareWithProviders: false });
  const [formError, setFormError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState(''); // 'view' | 'download' | 'delete'
  const [previewUrl, setPreviewUrl] = useState('');
  // Account-level "Hospital Data Sharing" as the server sees it (US-4.0). null = unknown.
  const [accountSharing, setAccountSharing] = useState(null);
  const [sharingBusy, setSharingBusy] = useState(false);

  useEffect(() => {
    if (visible) load();
    else closeSheet();
  }, [visible]);

  // If Hospital Data Sharing changes in Settings, re-read what clinics can see.
  useEffect(() => {
    if (!visible) return undefined;
    return ProfileAPI.subscribePermissions(() => load(true));
  }, [visible]);

  const load = async (isRefresh = false) => {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setLoadError('');
      const data = await HealthRecordsAPI.list();
      setRecords(Array.isArray(data.records) ? data.records : []);
      setAccountSharing(typeof data.sharing?.accountSharing === 'boolean' ? data.sharing.accountSharing : null);
    } catch (error) {
      setLoadError(error.message || 'Could not load your health records.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const counts = useMemo(() => {
    const result = { all: records.length };
    records.forEach(r => { result[r.category] = (result[r.category] || 0) + 1; });
    return result;
  }, [records]);

  const totalBytes = useMemo(() => records.reduce((sum, r) => sum + (r.sizeBytes || 0), 0), [records]);
  const sharedCount = useMemo(() => records.filter(r => r.shareWithProviders).length, [records]);
  const sharingPaused = accountSharing === false;

  const visibleRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = records.filter(r => {
      if (category !== 'all' && r.category !== category) return false;
      if (!q) return true;
      return [r.title, r.fileName, r.notes, r.categoryLabel].some(v => String(v || '').toLowerCase().includes(q));
    });
    if (sort === 'name') return list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'oldest') return list.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    return list.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  }, [records, category, query, sort]);

  function closeSheet() {
    setSheet(null);
    setPickedFile(null);
    setEditing(null);
    setSelected(null);
    setFormError('');
    setDeleteError('');
    setPreviewUrl('');
    setBusyAction('');
  }

  // ---- Picking a file -------------------------------------------------------

  const startForm = file => {
    const problem = validateFile(file);
    if (problem) {
      showNotice('File not supported', problem);
      return;
    }
    setPickedFile(file);
    setEditing(null);
    setForm({
      title: stripExtension(file.name),
      category: '',
      recordDate: '',
      notes: '',
      shareWithProviders: false,
    });
    setFormError('');
    setSheet('form');
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: SUPPORTED_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      startForm({ uri: asset.uri, name: asset.name || 'health-record', mimeType: asset.mimeType, size: asset.size });
    } catch {
      showNotice('Could not open files', 'Please try again.');
    }
  };

  const fromImageAsset = (asset, fallbackName) => {
    const ext = asset.mimeType === 'image/png' ? 'png' : asset.mimeType === 'image/heic' ? 'heic' : 'jpg';
    return {
      uri: asset.uri,
      name: asset.fileName || `${fallbackName}.${ext}`,
      mimeType: asset.mimeType || (ext === 'png' ? 'image/png' : 'image/jpeg'),
      size: asset.fileSize,
    };
  };

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        showNotice('Permission needed', 'Allow photo access to upload images of your records.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled || !result.assets?.length) return;
      startForm(fromImageAsset(result.assets[0], `record-${Date.now()}`));
    } catch {
      showNotice('Could not open photos', 'Please try again.');
    }
  };

  const takePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        showNotice('Permission needed', 'Allow camera access to photograph a paper record.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled || !result.assets?.length) return;
      startForm(fromImageAsset(result.assets[0], `scan-${Date.now()}`));
    } catch {
      showNotice('Could not open the camera', 'Please try again.');
    }
  };

  const chooseSource = picker => {
    setSheet(null);
    // Let the sheet close before the system picker opens (iOS can't present two at once).
    setTimeout(picker, 350);
  };

  // ---- Saving ---------------------------------------------------------------

  const openEdit = record => {
    setEditing(record);
    setPickedFile(null);
    setForm({
      title: record.title,
      category: record.category,
      recordDate: record.recordDate || '',
      notes: record.notes || '',
      shareWithProviders: !!record.shareWithProviders,
    });
    setFormError('');
    setSheet('form');
  };

  const submitForm = async () => {
    if (!form.title.trim()) return setFormError('Enter a name for this record.');
    if (!form.category) return setFormError('Choose a category for this record.');
    setFormError('');
    setSaving(true);
    try {
      const details = {
        title: form.title.trim(),
        category: form.category,
        recordDate: form.recordDate || null,
        notes: form.notes.trim(),
        shareWithProviders: form.shareWithProviders,
      };
      if (editing) {
        const updated = await HealthRecordsAPI.update(editing.id, details);
        setRecords(list => list.map(r => (r.id === updated.id ? updated : r)));
        setSelected(updated);
        setEditing(null);
        setSheet('detail');
      } else {
        const created = await HealthRecordsAPI.upload(pickedFile, details);
        setRecords(list => [created, ...list]);
        closeSheet();
        showNotice('Uploaded', `"${created.title}" was saved to your vault.`);
      }
      onChanged?.();
    } catch (error) {
      setFormError(error.message || 'Could not save this record.');
    } finally {
      setSaving(false);
    }
  };

  // ---- Viewing, downloading, deleting --------------------------------------

  const openDetail = async record => {
    setSelected(record);
    setDeleteError('');
    setPreviewUrl('');
    setSheet('detail');
    if (record.kind === 'image') {
      try {
        setPreviewUrl(await HealthRecordsAPI.getFileUrl(record.id, 'view'));
      } catch {}
    }
  };

  const openFile = async mode => {
    if (!selected) return;
    setBusyAction(mode);
    try {
      const url = await HealthRecordsAPI.getFileUrl(selected.id, mode);
      await Linking.openURL(url);
    } catch (error) {
      showNotice('Could not open file', error.message || 'Please try again.');
    } finally {
      setBusyAction('');
    }
  };

  const confirmDelete = () => {
    if (!selected) return;
    if (!selected.canDelete) {
      showNotice('Protected record', 'This record was issued by your clinic and cannot be deleted from the app.');
      return;
    }
    setDeleteError('');
    setSheet('confirm-delete');
  };

  const doDelete = async () => {
    const target = selected;
    if (!target) return;
    setDeleteError('');
    setBusyAction('delete');
    try {
      await HealthRecordsAPI.remove(target.id);
      setRecords(list => list.filter(r => r.id !== target.id));
      closeSheet();
      onChanged?.();
    } catch (error) {
      setBusyAction('');
      setDeleteError(error.message || 'Could not delete this record. Please try again.');
    }
  };

  // ---- Sharing with care providers (US-4.0) ---------------------------------
  // Changing sharing only flips a permission flag; the file itself is never touched.

  const toggleShare = async next => {
    const target = selected;
    if (!target || sharingBusy) return;
    const apply = value => {
      setSelected(r => (r && r.id === target.id ? { ...r, shareWithProviders: value } : r));
      setRecords(list => list.map(r => (r.id === target.id ? { ...r, shareWithProviders: value } : r)));
    };
    apply(next);
    setSharingBusy(true);
    try {
      const updated = await HealthRecordsAPI.update(target.id, { shareWithProviders: next });
      setSelected(r => (r && r.id === updated.id ? updated : r));
      setRecords(list => list.map(r => (r.id === updated.id ? updated : r)));
      onChanged?.();
    } catch (error) {
      apply(!next);
      showNotice('Sharing not changed', error.message || 'Please try again.');
    } finally {
      setSharingBusy(false);
    }
  };

  const enableAccountSharing = async () => {
    setSharingBusy(true);
    try {
      await ProfileAPI.setPermissions({ dataSharingConsent: true });
      const data = await HealthRecordsAPI.list();
      setRecords(Array.isArray(data.records) ? data.records : []);
      const on = data.sharing?.accountSharing === true;
      setAccountSharing(typeof data.sharing?.accountSharing === 'boolean' ? data.sharing.accountSharing : null);
      if (!on) showNotice('Not turned on yet', 'We could not update Hospital Data Sharing. Please try again from Settings.');
    } catch (error) {
      showNotice('Not turned on yet', error.message || 'Please try again from Settings.');
    } finally {
      setSharingBusy(false);
    }
  };

  const shareStatusText = record => {
    if (!record.shareWithProviders) return 'Private. Only you can see this file.';
    if (sharingPaused) return 'Hidden from your clinic while Hospital Data Sharing is off in Settings.';
    return 'Your clinic\'s staff and providers can view and download this file.';
  };

  // ---- Render ---------------------------------------------------------------

  const renderRecord = record => {
    const Icon = record.kind === 'image' ? ImageIcon : FileText;
    return (
      <TouchableOpacity key={record.id} style={styles.recordCard} onPress={() => openDetail(record)} activeOpacity={0.85}>
        <View style={[styles.recordIcon, record.kind === 'image' ? styles.recordIconImage : styles.recordIconPdf]}>
          <Icon size={22} color={record.kind === 'image' ? '#0d9488' : '#e11d48'} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.recordTitle} numberOfLines={1}>{record.title}</Text>
          <View style={styles.recordMetaRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{record.categoryLabel || categoryLabel(record.category)}</Text>
            </View>
            {!record.canDelete && <Lock size={13} color="#64748b" />}
            {record.shareWithProviders && <Users size={13} color="#0284c7" />}
          </View>
          <Text style={styles.recordSub} numberOfLines={1}>
            {formatDate(record.recordDate || record.createdAt)} · {formatBytes(record.sizeBytes)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderList = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={styles.mutedText}>Opening your vault...</Text>
        </View>
      );
    }
    if (loadError) {
      return (
        <View style={styles.centered}>
          <AlertCircle size={40} color="#f87171" />
          <Text style={styles.emptyTitle}>Couldn't load your records</Text>
          <Text style={styles.emptySubtitle}>{loadError}</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => load()}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.listInner}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={['#0ea5e9']} />}
      >
        {visibleRecords.length === 0 ? (
          <View style={styles.emptyContainer}>
            <FolderLock size={48} color="#cbd5e1" />
            <Text style={styles.emptyTitle}>
              {records.length === 0 ? 'Your vault is empty' : 'No matching records'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {records.length === 0
                ? 'Upload lab results, prescriptions, scans and other medical files to keep them in one place.'
                : 'Try a different category or search term.'}
            </Text>
            {records.length === 0 && (
              <TouchableOpacity style={styles.primaryBtn} onPress={() => setSheet('source')}>
                <Upload size={16} color="#fff" />
                <Text style={styles.primaryBtnText}>Upload your first record</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          visibleRecords.map(renderRecord)
        )}
      </ScrollView>
    );
  };

  const renderSourceSheet = () => (
    <View style={styles.sheet}>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>Upload a record</Text>
        <TouchableOpacity onPress={closeSheet} style={styles.closeBtn}><X size={18} color="#4b5563" /></TouchableOpacity>
      </View>
      <Text style={styles.sheetHint}>PDF, JPG, PNG, HEIC or WEBP · up to 10 MB</Text>
      {[
        { icon: FolderOpen, label: 'Browse files', desc: 'PDFs and images saved on your phone', run: pickDocument },
        { icon: Images, label: 'Choose from photos', desc: 'Pictures of results or prescriptions', run: pickPhoto },
        { icon: Camera, label: 'Take a photo', desc: 'Scan a paper record with your camera', run: takePhoto },
      ].map(option => (
        <TouchableOpacity key={option.label} style={styles.sourceRow} onPress={() => chooseSource(option.run)}>
          <View style={styles.sourceIcon}><option.icon size={20} color="#0284c7" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sourceLabel}>{option.label}</Text>
            <Text style={styles.sourceDesc}>{option.desc}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderFormSheet = () => (
    <View style={[styles.sheet, styles.sheetTall]}>
      <View style={styles.sheetHeader}>
        {editing ? (
          <TouchableOpacity onPress={() => { setSheet('detail'); setEditing(null); }} style={styles.closeBtn}>
            <ChevronLeft size={18} color="#4b5563" />
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.sheetTitle, { flex: 1 }]}>{editing ? 'Edit record' : 'Record details'}</Text>
        <TouchableOpacity onPress={closeSheet} style={styles.closeBtn} disabled={saving}><X size={18} color="#4b5563" /></TouchableOpacity>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
        {pickedFile && (
          <View style={styles.fileRow}>
            {String(pickedFile.mimeType || '').startsWith('image/')
              ? <Image source={{ uri: pickedFile.uri }} style={styles.fileThumb} />
              : <View style={[styles.recordIcon, styles.recordIconPdf]}><FileText size={22} color="#e11d48" /></View>}
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={1}>{pickedFile.name}</Text>
              {!!pickedFile.size && <Text style={styles.recordSub}>{formatBytes(pickedFile.size)}</Text>}
            </View>
          </View>
        )}

        <Text style={styles.fieldLabel}>Name <Text style={styles.required}>*</Text></Text>
        <TextInput
          style={styles.input}
          value={form.title}
          maxLength={120}
          placeholder="e.g. CBC Result – November"
          placeholderTextColor="#94a3b8"
          onChangeText={title => setForm(f => ({ ...f, title }))}
        />

        <Text style={styles.fieldLabel}>Category <Text style={styles.required}>*</Text></Text>
        <View style={styles.chipWrap}>
          {RECORD_CATEGORIES.map(c => {
            const active = form.category === c.id;
            return (
              <TouchableOpacity
                key={c.id}
                onPress={() => setForm(f => ({ ...f, category: c.id }))}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <DatePickerField
          label="Date on the record (optional)"
          placeholder="Select record date"
          defaultToToday
          value={form.recordDate}
          onChange={recordDate => setForm(f => ({ ...f, recordDate }))}
          style={{ marginTop: 14 }}
        />
        {!!form.recordDate && (
          <TouchableOpacity onPress={() => setForm(f => ({ ...f, recordDate: '' }))}>
            <Text style={styles.linkText}>Clear date</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.fieldLabel}>Notes (optional)</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={form.notes}
          maxLength={500}
          multiline
          placeholder="Doctor, clinic, or anything you want to remember"
          placeholderTextColor="#94a3b8"
          onChangeText={notes => setForm(f => ({ ...f, notes }))}
        />

        <View style={styles.shareRow}>
          <Users size={18} color="#0284c7" />
          <View style={{ flex: 1 }}>
            <Text style={styles.shareTitle}>Share with my care providers</Text>
            <Text style={styles.sourceDesc}>
              Off by default. When on, your clinic can view and download this file with its name, category, date and notes.
            </Text>
            {form.shareWithProviders && sharingPaused && (
              <Text style={styles.shareWarn}>Hospital Data Sharing is off in Settings, so your clinic won't see it yet.</Text>
            )}
          </View>
          <Switch
            value={form.shareWithProviders}
            onValueChange={shareWithProviders => setForm(f => ({ ...f, shareWithProviders }))}
            trackColor={{ false: '#E2E8F0', true: '#7DD3FC' }}
            thumbColor={form.shareWithProviders ? '#0284C7' : '#94A3B8'}
          />
        </View>

        {!!formError && (
          <View style={styles.errorBox}>
            <AlertCircle size={16} color="#dc2626" />
            <Text style={styles.errorText}>{formError}</Text>
          </View>
        )}
      </ScrollView>
      <TouchableOpacity style={[styles.primaryBtn, styles.fullBtn, saving && { opacity: 0.7 }]} onPress={submitForm} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : (editing ? <Pencil size={16} color="#fff" /> : <Upload size={16} color="#fff" />)}
        <Text style={styles.primaryBtnText}>
          {saving ? (editing ? 'Saving...' : 'Uploading...') : (editing ? 'Save changes' : 'Upload to vault')}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderDetailSheet = () => {
    if (!selected) return null;
    return (
      <View style={[styles.sheet, styles.sheetTall]}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { flex: 1 }]} numberOfLines={2}>{selected.title}</Text>
          <TouchableOpacity onPress={closeSheet} style={styles.closeBtn}><X size={18} color="#4b5563" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 12 }}>
          {selected.kind === 'image' && (
            <View style={styles.previewBox}>
              {previewUrl
                ? <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="contain" />
                : <ActivityIndicator color="#0ea5e9" />}
            </View>
          )}
          {[
            ['Category', selected.categoryLabel || categoryLabel(selected.category)],
            ['Date on record', selected.recordDate ? formatDate(selected.recordDate) : 'Not set'],
            ['Uploaded', formatDate(selected.createdAt)],
            ['File', `${selected.fileName} · ${formatBytes(selected.sizeBytes)}`],
            ['Added by', selected.source === 'facility' ? 'Your clinic' : 'You'],
          ].map(([label, value]) => (
            <View key={label} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{label}</Text>
              <Text style={styles.detailValue}>{value}</Text>
            </View>
          ))}
          {selected.source === 'facility' ? (
            <View style={styles.shareRow}>
              <ShieldCheck size={18} color="#0284c7" />
              <View style={{ flex: 1 }}>
                <Text style={styles.shareTitle}>Shared by your clinic</Text>
                <Text style={styles.sourceDesc}>
                  Your healthcare provider uploaded and shared this record with your mobile Health Record Vault.
                </Text>
              </View>
            </View>
          ) : (
            <View style={[styles.shareRow, selected.shareWithProviders && sharingPaused && styles.shareRowPaused]}>
              <Users size={18} color={selected.shareWithProviders && sharingPaused ? '#b45309' : '#0284c7'} />
              <View style={{ flex: 1 }}>
                <Text style={styles.shareTitle}>Share with my care providers</Text>
                <Text style={styles.sourceDesc}>{shareStatusText(selected)}</Text>
              </View>
              {sharingBusy
                ? <ActivityIndicator size="small" color="#0284c7" />
                : (
                  <Switch
                    value={!!selected.shareWithProviders}
                    onValueChange={toggleShare}
                    disabled={!!busyAction}
                    trackColor={{ false: '#E2E8F0', true: '#7DD3FC' }}
                    thumbColor={selected.shareWithProviders ? '#0284C7' : '#94A3B8'}
                    accessibilityLabel="Share this file with my care providers"
                  />
                )}
            </View>
          )}
          {!!selected.notes && (
            <View style={styles.notesBox}>
              <Text style={styles.detailLabel}>Notes</Text>
              <Text style={styles.notesText}>{selected.notes}</Text>
            </View>
          )}
          {!selected.canDelete && (
            <View style={styles.lockNote}>
              <Lock size={14} color="#64748b" />
              <Text style={styles.lockNoteText}>Issued by your clinic — this record can't be deleted from the app.</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.actionGrid}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => openFile('view')} disabled={!!busyAction}>
            {busyAction === 'view' ? <ActivityIndicator size="small" color="#0284c7" /> : <Eye size={18} color="#0284c7" />}
            <Text style={styles.actionText}>Open</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => openFile('download')} disabled={!!busyAction}>
            {busyAction === 'download' ? <ActivityIndicator size="small" color="#0284c7" /> : <Download size={18} color="#0284c7" />}
            <Text style={styles.actionText}>Download</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(selected)} disabled={!!busyAction}>
            <Pencil size={18} color="#0284c7" />
            <Text style={styles.actionText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionDanger, !selected.canDelete && styles.actionDisabled]}
            onPress={confirmDelete}
            disabled={!!busyAction}
          >
            {busyAction === 'delete'
              ? <ActivityIndicator size="small" color="#dc2626" />
              : (selected.canDelete ? <Trash2 size={18} color="#dc2626" /> : <Lock size={18} color="#94a3b8" />)}
            <Text style={[styles.actionText, { color: selected.canDelete ? '#dc2626' : '#94a3b8' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderConfirmDeleteSheet = () => {
    if (!selected) return null;
    const deleting = busyAction === 'delete';
    return (
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Delete this record?</Text>
          <TouchableOpacity onPress={() => { setDeleteError(''); setSheet('detail'); }} style={styles.closeBtn} disabled={deleting}>
            <X size={18} color="#4b5563" />
          </TouchableOpacity>
        </View>
        <Text style={styles.confirmBody}>
          "{selected.title}" will be permanently removed from your vault. This cannot be undone.
        </Text>
        {!!deleteError && (
          <View style={styles.errorBox}>
            <AlertCircle size={16} color="#dc2626" />
            <Text style={styles.errorText}>{deleteError}</Text>
          </View>
        )}
        <View style={styles.confirmActions}>
          <TouchableOpacity
            style={[styles.confirmBtn, styles.confirmCancelBtn]}
            onPress={() => { setDeleteError(''); setSheet('detail'); }}
            disabled={deleting}
          >
            <Text style={styles.confirmCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.confirmBtn, styles.confirmDeleteBtn, deleting && { opacity: 0.7 }]}
            onPress={doDelete}
            disabled={deleting}
          >
            {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Trash2 size={16} color="#fff" />}
            <Text style={styles.confirmDeleteText}>{deleting ? 'Deleting...' : 'Delete'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={sheet ? closeSheet : onClose}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <FolderLock size={22} color="#0ea5e9" />
              <Text style={styles.headerTitle}>Health Record Vault</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}><X size={20} color="#4b5563" /></TouchableOpacity>
          </View>

          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryCount}>{records.length} {records.length === 1 ? 'file' : 'files'}</Text>
              <Text style={styles.mutedSmall}>
                {formatBytes(totalBytes)} stored · {sharedCount === 0
                  ? 'private to you'
                  : sharingPaused ? 'clinic sharing off' : `${sharedCount} shared with your clinic`}
              </Text>
            </View>
            <TouchableOpacity style={styles.uploadBtn} onPress={() => setSheet('source')}>
              <Upload size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Upload</Text>
            </TouchableOpacity>
          </View>

          {sharedCount > 0 && sharingPaused && (
            <View style={styles.sharingBanner}>
              <ShieldOff size={18} color="#b45309" />
              <View style={{ flex: 1 }}>
                <Text style={styles.sharingBannerTitle}>Clinic sharing is off</Text>
                <Text style={styles.sharingBannerText}>
                  {sharedCount === 1 ? '1 file you marked as shared is' : `${sharedCount} files you marked as shared are`} hidden
                  from your clinic because Hospital Data Sharing is off.
                </Text>
              </View>
              <TouchableOpacity style={styles.sharingBannerBtn} onPress={enableAccountSharing} disabled={sharingBusy}>
                {sharingBusy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.sharingBannerBtnText}>Turn on</Text>}
              </TouchableOpacity>
            </View>
          )}
          {sharedCount > 0 && accountSharing === true && (
            <View style={[styles.sharingBanner, styles.sharingBannerOn]}>
              <ShieldCheck size={18} color="#047857" />
              <Text style={[styles.sharingBannerText, { flex: 1, color: '#065f46' }]}>
                Your clinic can see {sharedCount === 1 ? '1 shared file' : `${sharedCount} shared files`}. Turn sharing off on any file at any time.
              </Text>
            </View>
          )}

          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Search size={16} color="#94a3b8" />
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search records"
                placeholderTextColor="#94a3b8"
                returnKeyType="search"
              />
              {!!query && <TouchableOpacity onPress={() => setQuery('')}><X size={16} color="#94a3b8" /></TouchableOpacity>}
            </View>
            <TouchableOpacity
              style={styles.sortBtn}
              onPress={() => setSort(s => SORTS[(SORTS.findIndex(x => x.id === s) + 1) % SORTS.length].id)}
            >
              <ArrowDownUp size={14} color="#0284c7" />
              <Text style={styles.sortText}>{SORTS.find(s => s.id === sort)?.label}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterInner}>
            {[{ id: 'all', label: 'All' }, ...RECORD_CATEGORIES].map(c => {
              const active = category === c.id;
              const count = counts[c.id] || 0;
              if (c.id !== 'all' && count === 0 && !active) return null;
              return (
                <TouchableOpacity key={c.id} onPress={() => setCategory(c.id)} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label} ({count})</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {renderList()}
        </View>

        {!!sheet && (
          <KeyboardAvoidingView
            style={styles.sheetOverlay}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={saving || busyAction === 'delete' ? undefined : closeSheet} />
            {sheet === 'source' && renderSourceSheet()}
            {sheet === 'form' && renderFormSheet()}
            {sheet === 'detail' && renderDetailSheet()}
            {sheet === 'confirm-delete' && renderConfirmDeleteSheet()}
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'flex-end' },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '92%',
    paddingTop: 18,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 },
  headerTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 19, fontWeight: '700', color: '#1f2937' },
  closeBtn: { padding: 6, borderRadius: 999, backgroundColor: '#f1f5f9' },

  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 20, padding: 14, borderRadius: 14, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#e0f2fe',
  },
  summaryCount: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  mutedSmall: { fontSize: 12, color: '#64748b', marginTop: 2 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0ea5e9', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginTop: 12 },
  searchBox: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 10, paddingHorizontal: 10, height: 40, backgroundColor: '#f8fafc',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a', paddingVertical: 0 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 40, borderRadius: 10, backgroundColor: '#f0f9ff' },
  sortText: { fontSize: 13, fontWeight: '600', color: '#0284c7' },

  filterBar: { flexGrow: 0, marginTop: 10 },
  filterInner: { paddingHorizontal: 20, gap: 8, paddingBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  chipText: { fontSize: 12.5, fontWeight: '600', color: '#475569' },
  chipTextActive: { color: '#fff' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  listInner: { padding: 20, paddingTop: 12, gap: 10, paddingBottom: 40 },
  recordCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14,
    borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff',
  },
  recordIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  recordIconPdf: { backgroundColor: '#fff1f2' },
  recordIconImage: { backgroundColor: '#f0fdfa' },
  recordTitle: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  recordMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  categoryBadge: { backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  categoryBadgeText: { fontSize: 11, fontWeight: '600', color: '#1d4ed8' },
  recordSub: { fontSize: 12, color: '#6b7280', marginTop: 4 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  mutedText: { color: '#64748b', fontSize: 14 },
  emptyContainer: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 12, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#334155', textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 19, marginBottom: 8 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0ea5e9', paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  fullBtn: { marginTop: 8 },

  sheetOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28 },
  sheetTall: { maxHeight: '88%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  sheetHint: { fontSize: 12.5, color: '#64748b', marginBottom: 12 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  sourceIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#f0f9ff', alignItems: 'center', justifyContent: 'center' },
  sourceLabel: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  sourceDesc: { fontSize: 12, color: '#64748b', marginTop: 2 },

  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: '#f8fafc', marginVertical: 8 },
  fileThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#e2e8f0' },
  fileName: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#334155', marginTop: 14, marginBottom: 6 },
  required: { color: '#dc2626' },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#0f172a', backgroundColor: '#fff',
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  linkText: { color: '#0284c7', fontSize: 12.5, fontWeight: '600', marginTop: 6 },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: '#f0f9ff' },
  shareTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  shareRowPaused: { backgroundColor: '#fffbeb' },
  shareWarn: { fontSize: 12, color: '#b45309', marginTop: 4 },
  sharingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginTop: 10, padding: 12,
    borderRadius: 12, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a',
  },
  sharingBannerOn: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' },
  sharingBannerTitle: { fontSize: 13, fontWeight: '700', color: '#92400e' },
  sharingBannerText: { fontSize: 12, color: '#92400e', marginTop: 2 },
  sharingBannerBtn: { backgroundColor: '#d97706', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, minWidth: 72, alignItems: 'center' },
  sharingBannerBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderRadius: 10, backgroundColor: '#fef2f2' },
  errorText: { flex: 1, color: '#b91c1c', fontSize: 13 },

  previewBox: { height: 220, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginVertical: 10, overflow: 'hidden' },
  previewImage: { width: '100%', height: '100%' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  detailLabel: { fontSize: 13, color: '#64748b' },
  detailValue: { fontSize: 13, fontWeight: '600', color: '#1f2937', flexShrink: 1, textAlign: 'right' },
  notesBox: { marginTop: 10, padding: 12, borderRadius: 10, backgroundColor: '#f8fafc', gap: 4 },
  notesText: { fontSize: 13.5, color: '#334155', lineHeight: 19 },
  lockNote: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  lockNoteText: { flex: 1, fontSize: 12.5, color: '#64748b' },
  actionGrid: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 12, backgroundColor: '#f0f9ff' },
  actionDanger: { backgroundColor: '#fef2f2' },
  actionDisabled: { backgroundColor: '#f1f5f9' },
  actionText: { fontSize: 12, fontWeight: '600', color: '#0284c7' },
  confirmBody: { fontSize: 14, color: '#475569', lineHeight: 20, marginTop: 4, marginBottom: 16 },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  confirmBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12,
  },
  confirmCancelBtn: { backgroundColor: '#f1f5f9' },
  confirmCancelText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  confirmDeleteBtn: { backgroundColor: '#dc2626' },
  confirmDeleteText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
