import { el, initials } from '../core/utils.js';

const images = new Map();

export function setCandidateImages(entries) {
  images.clear();
  Object.keys(entries).forEach(name => {
    if (name && entries[name]) {
      images.set(name, entries[name]);
    }
  });
}

export function createAvatar(name, party, className) {
  const wrapper = el('span', `avatar ${party} ${className || ''}`.trim());
  const source = images.get(name) || null;
  const fallback = () => {
    wrapper.textContent = initials(name);
    wrapper.classList.add('avatar-initials');
  };
  if (source) {
    const image = new Image();
    image.alt = name;
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      image.remove();
      fallback();
    });
    image.src = source;
    wrapper.appendChild(image);
  } else {
    fallback();
  }
  return wrapper;
}

export function mountAvatar(container, name, party, className) {
  container.replaceChildren(createAvatar(name, party, className));
}

const slug = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function mountCutout(container, name, party) {
  if (images.has(name)) {
    mountAvatar(container, name, party);
    return;
  }
  const tries = [`images/cutouts/${slug(name)}.png`, `images/cutouts/${party}.png`];
  const image = new Image();
  image.className = 'cutout';
  image.alt = name;
  let index = 0;
  image.addEventListener('error', () => {
    index += 1;
    if (index < tries.length) {
      image.src = tries[index];
    } else {
      mountAvatar(container, name, party);
    }
  });
  image.src = tries[0];
  container.replaceChildren(image);
}

export function candidateImageUrls(name, party) {
  const urls = [];
  if (images.has(name)) {
    urls.push(images.get(name));
  }
  urls.push(`images/cutouts/${slug(name)}.png`, `images/cutouts/${party}.png`);
  return urls;
}

const portraitCache = new Map();

export function loadPortrait(name, party) {
  const urls = candidateImageUrls(name, party);
  const key = urls.join('|');
  if (portraitCache.has(key)) {
    return portraitCache.get(key);
  }
  const attempt = index => new Promise(resolve => {
    if (index >= urls.length) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    image.onload = () => resolve(urls[index]);
    image.onerror = () => attempt(index + 1).then(resolve);
    image.src = urls[index];
  });
  const promise = attempt(0);
  portraitCache.set(key, promise);
  return promise;
}
