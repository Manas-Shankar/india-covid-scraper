const Apify = require('apify');

const source = 'https://www.mohfw.gov.in/';      //link to scrape India COVID stats
const LATEST = 'LATEST';


Apify.main( async ()=>{

    const INDkvstore = await Apify.openKeyValueStore("COVID-INDIA-STATS");     //open key-value store of name "COVID-INDIA-STATS"
    const dataset = await Apify.openDataset('COVID-19-IN-HISTORY');            //open dataset to store changes in data over time

    console.log("launching puppeteer");
    const browser = await Apify.launchPuppeteer();

    const page = await browser.newPage();            //opens a new page
    await Apify.utils.puppeteer.injectJQuery(page);  //injects jquery into page 

    console.log("Going to the India stats website");

    await page.goto(source,{waitUntil:"networkidle0",timeout:600000});    //networkidle0 = no network event for at least 500 ms

    console.log("getting stats for India");

    const result = await page.evaluate(()=>{                 //scrapes data using jquery for selection of tags

        const now = new Date();
        
        const activeCases = Number($('strong:contains(Active)').next().text().split("(")[0]);
        const activeCasesNew = Number($('strong:contains(Active)').next().text().split("(")[1].replace(/\D/g, ''));
        const recovered = Number($('strong:contains(Discharged)').next().text().split("(")[0]);
        const recoveredNew = Number($('strong:contains(Discharged)').next().text().split("(")[1].replace(/\D/g, ''));
        const deaths = Number($('strong:contains(Deaths)').next().text().split("(")[0]);
        const deathsNew = Number($('strong:contains(Deaths)').next().text().split("(")[1].replace(/\D/g, ''));
        const previousDayTests = Number($('.header-section > div > div > div > div > div > marquee > span').text().split(" ")[9].split(",").join(""));

        const rawTableRows = [...document.querySelectorAll("#state-data > div > div > div > div > table > tbody > tr")];
        const regionsTableRows = rawTableRows.filter(row => row.querySelectorAll('td').length === 8);
        const regionData = [];

        for (const row of regionsTableRows){
            const cells = Array.from(row.querySelectorAll("td")).map(td => getFormattedNumber(td));    // data from table is formatted into  numbers and text 
            if (cells[1] !== 'Total#') regionData.push({                                                   
                region: cells[1],
                totalInfected: Number(cells[2]),
                newInfected: Number(cells[3]),
                recovered: Number(cells[4]),
                newRecovered: Number(cells[5]),
                deceased: Number(cells[6]),
                newDeceased: Number(cells[7])
            });
        }

        function getFormattedNumber(td) {
            const tdText = $(td).text().trim();
            if ($(td).find('.fa-arrow-up').length) return Number(`+${tdText}`);                 //if up arrow found, replace with +{number of cases}
            if ($(td).find('.fa-arrow-down').length) return Number(`-${tdText}`);               //if down arrow found, replace with -{number of cases}
            return isNaN(tdText) ? tdText : Number(tdText);
        }

        const data = {                               //store data scraped in Object format
            activeCases,
            activeCasesNew,
            recovered,
            recoveredNew,
            deaths,
            deathsNew,
            previousDayTests,
            totalCases : activeCases + recovered + deaths,
            sourceURL : "https://www.mohfw.gov.in/",
            lastUpdatedAtApify: new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes())).toISOString(),
            regionData : regionData
            
        };

        return data;
    })

    console.log(result);

    let latest = await INDkvstore.getValue(LATEST);          //retrieve previously stored LATEST values, if any

    if(!latest){
        await INDkvstore.setValue('LATEST',result);          //if latest values does not exist, create a LATEST entry 
        latest = result;
    }

    delete latest.lastUpdatedAtApify;
    const actual = Object.assign({},result);                 //create object to store most recent data

    delete actual.lastUpdatedAtApify;

    if(JSON.stringify(latest)!== JSON.stringify(actual))      //compare pre-existing LATEST value with most recent fetch
    {
        await dataset.pushData(result);                       //if different, push most recent data into history 
    }

    await INDkvstore.setValue('LATEST',result);                
    await Apify.pushData(result);

    console.log("Closing puppeteer .... ");
    await browser.close();
    console.log("Done");


});

// CODE WAS WRITTEN USING THE GITHUB REPO https://github.com/apify/covid-19





