# Pictures and videos for the home page

The home page shows a built-in illustration for each feature. To use your own picture or video,
drop a file here with **exactly** one of these names:

| Name | Where it shows | Size |
| --- | --- | --- |
| `hero` | top of the home page | 1600 x 1000 (16:10) |
| `flood-desk` | flood desk card | 1200 x 900 (4:3) |
| `find-people` | find people card | 1200 x 900 (4:3) |
| `sms` | SMS simulator card | 1200 x 900 (4:3) |
| `flood-guide` | flood guide card | 1200 x 900 (4:3) |

Extensions: images `.webp` (best), `.jpg`, `.jpeg`, `.png`; videos `.mp4`, `.webm`.
If both a video and an image exist for a name, the video is used. Videos are muted, looping and
have controls; they never autoplay with sound. If nothing is here, the built-in illustration shows.

After adding or removing a file, restart `pnpm dev` or rebuild so the page picks it up.

## Keep it light and respectful

- Images under about 300 KB, videos under about 5 MB (short clips, 10 to 20 seconds).
- Add people only with their consent. Never use the face of a real missing person.
- Label AI-generated pictures and videos as illustrations (for example in the alt text:
  "Illustration, AI-generated: a family reading a flood alert").
- Avoid distressing images of the Nepal disaster; show preparedness and help, not harm.

## Photo credits

Photos from Unsplash need a credit. List them in `public/home/credits.json`:

```json
{ "hero": { "photographer": "Name", "photoUrl": "https://unsplash.com/photos/...", "title": "Optional" } }
```

When a photo (not a video or the built-in illustration) is shown for a name and `credits.json` has
an entry for it, the page adds a small "Photo: Name / Unsplash" link on the picture. A missing or
malformed file just means no credit line.
