'use client';
import { useState } from 'react';
import { Upload, Link, MapPin, Check, LoaderCircle, Film, ArrowUpRight } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { categories, type Place } from '@/lib/types';
import { externalSource, placeInput } from '@/lib/validation';
import { regionAtCenter } from '@/lib/regions';
import { useExplorer } from '@/lib/store';
import { videoThumbnail } from '@/lib/video-thumbnail';
export type DraftLocation = { latitude: number; longitude: number };
export function ImportDialog({
  open,
  onOpenChange,
  location,
  onPick,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  location: DraftLocation | null;
  onPick: () => void;
  onAdded: (p: Place) => void;
}) {
  const [mode, setMode] = useState<'link' | 'file'>('link');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('Природа');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [localOnly, setLocalOnly] = useState(false);
  const addPlace = useExplorer((s) => s.addPlace);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    const source = mode === 'link' ? externalSource(url) : 'upload';
    if (!source) {
      setError('Вставьте HTTPS-ссылку TikTok, Instagram Reel или YouTube.');
      return;
    }
    if (
      mode === 'file' &&
      (!file || !['video/mp4', 'video/webm'].includes(file.type) || file.size > 50 * 1024 * 1024)
    ) {
      setError('Выберите MP4 или WebM до 50 МБ.');
      return;
    }
    const latitude = lat !== '' ? Number(lat) : location?.latitude;
    const longitude = lng !== '' ? Number(lng) : location?.longitude;
    const parsed = placeInput.safeParse({
      region: regionAtCenter([Number(longitude), Number(latitude)], 'karelia').name,
      name,
      description,
      city,
      category,
      latitude,
      longitude,
      thumbnailUrl: '/media/fallback.svg',
    });
    if (!parsed.success) {
      setError('Заполните название, описание, город и выберите корректные координаты.');
      return;
    }
    setBusy(true);
    try {
      let playbackUrl: string | undefined;
      if (mode === 'file') {
        const upload = await fetch('/api/uploads', {
          method: 'POST',
          headers: { 'Content-Type': file!.type },
          body: file,
        });
        const r = await upload.json();
        if (!upload.ok) throw new Error(r.error);
        playbackUrl = r.url;
      }
      const p = {
        ...parsed.data,
        thumbnailUrl:
          mode === 'file' && file ? await videoThumbnail(file) : parsed.data.thumbnailUrl,
        video: { sourceType: source, originalUrl: mode === 'link' ? url : undefined, playbackUrl },
      };
      let saved: Place;
      if (localOnly) {
        saved = { ...p, id: crypto.randomUUID() } as Place;
      } else {
        const res = await fetch('/api/places', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`${data.error} Можно включить сохранение в этом браузере.`);
        saved = data;
      }
      addPlace(saved);
      onAdded(saved);
      setSuccess(
        localOnly ? 'Место сохранено в этом браузере.' : 'Видео и место сохранены на сервере.',
      );
      setName('');
      setDescription('');
      setUrl('');
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить место.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="import-dialog">
        <div className="dialog-eyebrow">
          <Film size={17} /> ПОДЕЛИТЕСЬ ОТКРЫТИЕМ
        </div>
        <DialogTitle className="dialog-title">
          У каждого места
          <br />
          есть своя история.
        </DialogTitle>
        <DialogDescription className="dialog-subtitle">
          Добавьте видео и покажите, куда стоит отправиться.
        </DialogDescription>
        <form onSubmit={submit}>
          <div className="segmented">
            <button
              type="button"
              className={mode === 'link' ? 'selected' : ''}
              onClick={() => setMode('link')}
            >
              <Link size={15} /> Ссылка на видео
            </button>
            <button
              type="button"
              className={mode === 'file' ? 'selected' : ''}
              onClick={() => setMode('file')}
            >
              <Upload size={15} /> Свой файл
            </button>
          </div>
          {mode === 'link' ? (
            <label>
              Ссылка на видео
              <input
                required
                type="url"
                placeholder="YouTube Shorts, TikTok или Instagram Reel"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <small>
                Официальный плеер YouTube или переход к оригиналу. Мы не скачиваем чужие ролики.
              </small>
            </label>
          ) : (
            <label className="file-drop">
              <Upload size={25} />
              <b>{file ? file.name : 'Выберите своё видео'}</b>
              <span>MP4 / WebM · до 50 МБ</span>
              <input
                aria-label="Видеофайл"
                type="file"
                accept="video/mp4,video/webm"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          )}
          <label>
            Название места
            <input
              required
              minLength={2}
              maxLength={100}
              placeholder="Как называется это место?"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="form-row">
            <label>
              Город / район
              <input
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Например, Сортавала"
              />
            </label>
            <label>
              Категория
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {categories.slice(1).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Описание
            <textarea
              required
              minLength={5}
              maxLength={800}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Что здесь особенного?"
              rows={2}
            />
          </label>
          <div className="location-field">
            <MapPin size={18} />
            <span>
              {location
                ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`
                : 'Привяжите видео к реальному месту'}
            </span>
            <button
              type="button"
              onClick={() => {
                setLat('');
                setLng('');
                onPick();
              }}
            >
              На карте <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="form-row">
            <label>
              Широта
              <input
                type="number"
                step="any"
                min="-85"
                max="85"
                placeholder={String(location?.latitude ?? '61.94')}
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </label>
            <label>
              Долгота
              <input
                type="number"
                step="any"
                min="-180"
                max="180"
                placeholder={String(location?.longitude ?? '30.58')}
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </label>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={localOnly}
              onChange={(e) => setLocalOnly(e.target.checked)}
            />{' '}
            Сохранить место только в этом браузере
          </label>
          <p className="small-note">
            Загружайте только собственные видео или материалы, на использование которых у вас есть
            разрешение.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="form-success" role="status">
              <Check size={16} />
              {success}
            </p>
          )}
          <Button type="submit" disabled={busy} className="full-width">
            {busy ? <LoaderCircle size={17} className="spin" /> : <Upload size={17} />}{' '}
            {busy ? 'Сохраняем…' : 'Добавить место'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
