/* Narrative collectibles are run state, separate from the Books' live records. */
(()=>{
 const items=[
  {id:'blood',name:'Ram’s blood',art:'blood',kind:'consumable',source:'shop',repeat:true,teaser:'A sealed bottle of sacrificed ram’s blood.',story:'Drink one bottle to recover 10 clarity. A bottle stays in your inventory until you use it.'},
  {id:'lyre',name:'Lyre',art:'lyre',kind:'instrument',source:'shop',shelf:'left',gift:true,teaser:'The keeper has been saving this for someone.',story:'A gift from the keeper. This lyre is no ordinary instrument. It plays whenever you handle a belonging of one particular person, whether you inspect it or bring it onto the left shelf. Take the music as a signal: when two things make it sing, they belong to the same hands.'},
  {id:'chime',name:'Wooden wind chime',art:'chime',kind:'instrument',source:'cerberus',shelf:'right',story:'Cerberus brought this home. These wooden chimes ring softly for the belongings of one particular person, when you inspect them or bring them onto the right shelf. Listen for it: whatever makes them ring was once held by the same person.'},
  {id:'song',name:'Torn song sheet',art:'song',owner:'Orpheus',source:'cerberus',teaser:'A few lines have survived the water.'},
  {id:'plectrum',name:'Broken plectrum',art:'plectrum',owner:'Orpheus',source:'shop',price:6,teaser:'A well-used tool. Its wear may tell you what its owner did.'},
  {id:'laurel',name:'Poet’s laurel',art:'laurel',owner:'Orpheus',source:'shop',price:16,teaser:'The award citation is intact. Both the recipient and the reason can still be read.'},
  {id:'clasp',name:'Traveller’s clasp',art:'clasp',owner:'Orpheus',source:'shop',price:12,teaser:'A message folded behind the fastening describes a journey below.'},
  {id:'ribbon',name:'Wedding ribbon',art:'ribbon',owner:'Eurydice',source:'cerberus',teaser:'The knot has never been untied.'},
  {id:'comb',name:'Wooden comb',art:'comb',owner:'Eurydice',source:'shop',price:10,teaser:'A personal dedication survives beneath the handle. Two initials, and a promise of home.'},
  {id:'flower',name:'Pressed narcissus',art:'flower',owner:'Eurydice',source:'shop',price:8,teaser:'A bouquet flower, with part of its original wrapping. The occasion is still legible.'},
  {id:'veil',name:'Veil fragment',art:'veil',owner:'Eurydice',source:'shop',price:12,teaser:'A witness kept this cloth with an account of how the celebration ended.'},
  {id:'keepsake',name:'Clay keepsake',art:'keepsake',owner:'Eurydice',source:'shop',price:16,teaser:'A complete wedding letter, sealed inside the clay. The names have survived.'},
  {id:'birth-record',name:'Birth certificate',art:'record',owner:'Eurydice',kind:'record',source:'court'},
  {id:'marriage-record',name:'Marriage record',art:'record',owner:'Eurydice',kind:'record',source:'court'},
  {id:'death-record',name:'Death record',art:'record',owner:'Eurydice',kind:'record',source:'court'},
  {id:'passage-record',name:'Redeemed passage permit',art:'record',owner:'Eurydice',kind:'record',source:'court'},
  {id:'elysium-ticket',name:'Golden ticket to Elysium',art:'ticket',kind:'quest',source:'court',story:'Minos gave you passage to the bright fields of Elysium. You may choose rest after your work is done.'},
  {id:'petition',name:'Petition',art:'petition',kind:'quest',source:'court',story:'Minos entrusted you with an empty petition. Complete it for the soul waiting in the Court of Judgement.'}
 ].map(item=>({kind:'fragment',...item}));
 // Draft story copy for review. Ownership drives the instruments; these
 // descriptions never grade a soul or replace a query against the Books.
 const stories={
  song:'An unfinished song, signed only “O.” Someone has crossed out the last verse again and again. The handwriting belongs to someone who made songs, and could not find an ending.',
  plectrum:'One edge is polished smooth; the other has split where it struck a string. A loop of lyre gut is still caught in the crack. Its owner played a stringed instrument often enough to wear this tool down. No name survives.',
  laurel:'The ribbon carries a complete award citation: “To Orpheus, poet and musician, whose voice and lyre moved every listener.” The reverse lists a prize for a song performed by its own composer. Orpheus wrote the song, sang it, and accompanied himself on the lyre.',
  clasp:'A folded message is trapped behind the clasp: “Eurydice, the ferryman says the living do not belong here. I have followed you below, and I will ask them to let you come home. —O.” The writer entered the underworld while alive, looking for Eurydice. His full name and their relationship are left unsaid.',
  ribbon:'A ribbon embroidered with “E.”, still tied around the stems of dried bridal flowers. The knot has never been untied. Someone wanted to keep a piece of that wedding day.',
  comb:'The handle reads “For E., from O. For our first morning in the same home.” Beside the dedication are two small figures beneath a single roof. E. and O. planned a life together. The carving does not say whether they were married.',
  flower:'The paper wrapper reads “From your wedding bouquet.” A second line, “For the bride, E…”, has dissolved into a water stain. The flower belonged to a bride whose name began with E.; neither her spouse nor the wedding date is preserved.',
  veil:'Pinned to the cloth is a witness’s note: “She fell in the grass before the bridal flowers had wilted. We carried her away still wearing her wedding veil. By nightfall we were mourning her.” The bride died on her wedding day. The witness did not write her name or the date.',
  keepsake:'Inside is a letter from a friend: “Eurydice, congratulations on your wedding to Orpheus. May your new home always be full of his music. I am so glad to call you husband and wife.” The letter names both spouses and explicitly confirms their marriage; it preserves no date.'
 };
 for(const item of items)if(stories[item.id])item.story=stories[item.id];
 const api={all:items,get:id=>items.find(item=>item.id===id)};
 if(typeof module!=='undefined')module.exports=api;else window.NetherItems=api;
})();
