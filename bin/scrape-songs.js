var SpotifyWebApi = require('spotify-web-api-node')
var io = require('indian-ocean')
var d3 = require('d3')
var jp = require('d3-jetpack')

var sp
var credentials = io.readDataSync(__dirname + '/credentials.json')

var cachedAlbums = io.readdirFilterSync(__dirname + '/album-cache')
var isCached = {}
cachedAlbums.forEach(d => isCached[d.replace('.tsv', '')] = true)

init()

async function init(){
  if (!credentials.code) credentials = await require('./auth')()
  sp = new SpotifyWebApi(credentials)

  var refreshData = await sp.refreshAccessToken()
  sp.setAccessToken(refreshData.body['access_token'])

  try { generateTidy() } catch (e){ console.log(e) }
}

async function generateTidy(){
  try {
    var tidy = []

    var artists = (await dlAll(sp.getMySavedTracks))
      .map(d => d.track.artists[0])
      .map(d => ({artist: d.name, artistId: d.id}))

    var uniqueArtists = jp.nestBy(artists, d => d.artistId).map(d => d[0])
      // .slice(0, 25)

    for ({artist, artistId} of uniqueArtists){
      console.log(artist)
      var albums = (await dlAll(sp.getArtistAlbums, artistId))
        .map(d => ({album: d.name, date: d.release_date, albumId: d.id}))
      

      for ({album, albumId, date} of albums){
        var albumTidy = []
        var cachePath = `${__dirname}/album-cache/${albumId}.tsv`

        if (isCached[albumId]){
          albumTidy = io.readDataSync(cachePath)
        } else {
          var songs = (await dlAll(sp.getAlbumTracks, albumId))
            .map(d => ({song: d.name, songId: d.id}))
          
          songs.forEach(({song, songId}) => {
            albumTidy.push({artist, artistId, album, albumId, date, song, songId})
          })
  
          io.writeDataSync(cachePath, albumTidy)
        }

        tidy.push(...albumTidy)
      }
    }
  } catch (e){
    console.log(e)
  }

  io.writeDataSync(__dirname + '/../public/tidy.tsv', tidy)
}

async function apiPlayground(){
  var meData = (await sp.getMe()).body
  // console.log(meData)
  var savedTracks = await sp.getMySavedTracks()
  var artistId = savedTracks.body.items[0].track.artists[0].id
  console.log({artistId})

  var albums = await sp.getArtistAlbums(artistId)
  // console.log(albums.body.items)
  var albumId = albums.body.items[0].id
  console.log({albumId})

  var album = await sp.getAlbumTracks(albumId)
  console.log(album.body)
}

async function dlAll(fn, id){
  var pages = []
  var opts = {offset: 0, limit: 50, country: 'US', include_groups: 'album,single'}

  do{
    var lastPage = (await fn.apply(sp, id ? [id, opts] : [opts])).body

    // enough to avoid rate limit? this issues suggests 10/s
    // https://github.com/thelinmichael/spotify-web-api-node/pull/218
    // could also retry after rate limited 
    // https://github.com/thelinmichael/spotify-web-api-node/issues/217
    await sleep(200) 

    pages = pages.concat(lastPage.items)
    opts.offset += opts.limit
  } while (lastPage.next && fn != sp.getArtistAlbums) // disable paging on artists albums; bach has too many!

  return pages
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}











