const res = await fetch('https://graphql.anilist.co', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: `query($id:Int){Media(id:$id,type:ANIME){id title{romaji english} startDate{year} episodes format synonyms}}`,
    variables: { id: 166873 }
  })
});
const json = await res.json();
console.log(JSON.stringify(json.data?.Media, null, 2));
