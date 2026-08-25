// Canonical Caput titles from Calvin, Institutio christianae religionis (1559),
// Barth/Niesel text as tabulated at calvin.reformation.nl (Liber III–IV).
// Used only to label the public outline; S3 OCR bodies stay unchanged.
package latin

// liberTitles are short Liber headings for Argumentum / book chrome.
var liberTitles = map[string]string{
	"III": "De modo percipiendae Christi gratiae",
	"IV":  "De externis mediis vel adminiculis",
}

// caputTitles[liber][roman] → Latin Caput title (1559).
var caputTitles = map[string]map[string]string{
	"III": {
		"XI":    "De iustificatione fidei, ac primo de ipsa nominis et rei definitione",
		"XII":   "Ut serio nobis persuadeatur gratuita iustificatio, ad Dei tribunal tollendas esse mentes",
		"XIII":  "Duo esse in gratuita iustificatione observanda",
		"XIV":   "Quale initium iustificationis et continui progressus",
		"XV":    "Quae de operum meritis iactantur, tam Dei laudem in conferenda iustitia, quam salutis certitudinem evertere",
		"XVI":   "Refutatio calumniarum quibus hanc doctrinam odio gravare conantur Papistae",
		"XVII":  "Promissionum Legis et Evangelii conciliatio",
		"XVIII": "Ex mercede male colligi operum iustitiam",
		"XIX":   "De libertate Christiana",
		"XX":    "De Oratione, quae praecipuum est fidei exercitium, et qua Dei beneficia quotidie percipimus",
		"XXI":   "De electione aeterna, qua Deus alios ad salutem, alios ad interitum praedestinavit",
		"XXII":  "Confirmatio huius doctrinae ex Scripturae testimoniis",
		"XXIII": "Refutatio calumniarum quibus haec doctrina semper inique gravata fuit",
		"XXIV":  "Electionem sanciri Dei vocatione: reprobos autem sibi accersere iustum, cui destinati sunt, interitum",
		"XXV":   "De resurrectione ultima",
	},
	"IV": {
		"I":     "De vera Ecclesia, cum qua nobis colenda est unitas: quia piorum omnium mater est",
		"II":    "Comparatio falsae Ecclesiae cum vera",
		"III":   "De Ecclesiae doctoribus et ministris, eorum electione et officio",
		"IV":    "De statu veteris Ecclesiae et ratione gubernandi quae in usu fuit ante Papatum",
		"V":     "Antiquam regiminis formam omnino pessundatam fuisse tyrannide Papatus",
		"VI":    "De primatu Romanae sedis",
		"VII":   "De exordio et incrementis Romani Papatus, donec se in hanc altitudinem extulit qua et Ecclesiae libertas oppressa, et omnis moderatio eversa fuit",
		"VIII":  "De potestate Ecclesiae quoad fidei dogmata: et quam effraeni licentia ad vitiandam omnem doctrinae puritatem tracta fuerit in Papatu",
		"IX":    "De Conciliis, eorumque authoritate",
		"X":     "De potestate in legibus ferendis, in qua saevissimam tyrannidem in animas et carnificinam exercuit Papa cum suis",
		"XI":    "De Ecclesiae iurisdictione, eiusque abusu, qualis cernitur in Papatu",
		"XII":   "De Ecclesiae disciplina, cuius praecipuus usus in censuris et excommunicatione",
		"XIII":  "De votis, quorum temeraria nuncupatione quisque se misere implicuit",
		"XIV":   "De Sacramentis",
		"XV":    "De Baptismo",
		"XVI":   "Paedobaptismum cum Christi institutione et signi natura optime congruere",
		"XVII":  "De sacra Christi Coena: et quid nobis conferat",
		"XVIII": "De Missa Papali, quo sacrilegio non modo profanata fuit Coena Christi, sed in nihilum redacta",
		"XIX":   "De quinque falso nominatis Sacramentis",
		"XX":    "De politica administratione",
	},
}

func canonicalCaputTitle(liber, caput string) string {
	if caput == "Argumentum" {
		if t, ok := liberTitles[liber]; ok {
			return t
		}
		return "Argumentum"
	}
	byLiber, ok := caputTitles[liber]
	if !ok {
		return ""
	}
	return byLiber[caput]
}
